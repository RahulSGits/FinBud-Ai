// OmniDimension adapter.
//
// Endpoints checked against the official Python SDK
// (github.com/Omnidim/omnidim-python-sdk), which is the authoritative
// description of the REST API:
//   base   https://backend.omnidim.io/api/v1
//   auth   Authorization: Bearer <key>
//   POST   agents/create        { name, context_breakdown:[{title,body}], welcome_message }
//   PUT    agents/{id}
//   DELETE agents/{id}
//   POST   calls/dispatch       { agent_id:int, to_number:"+…", call_context:{}, from_number_id:int|null }
//                               -> { success, status:"dispatched", requestId, ... }
//   GET    calls/logs           ?page&page_size&agent_id&call_status
//   GET    calls/logs/{id}
//   GET    providers/llms | providers/tts | providers/stt | providers/voices
//   GET    phone_number/list    ?page&page_size
//   POST   phone_number/attach  { phone_number_id, agent_id }
//
// OmniDimension agent ids are integers, unlike our string ids, so we coerce at
// the boundary.
import {
  AgentConfig, CallReport, CallStatus, FetchedCallResult, LanguageOption, ModelOption,
  PhoneNumberOption, ProviderCapabilities, ProviderError, StartCallParams, StartCallResult,
  VoiceEvent, VoiceOption, VoiceProvider, buildSystemPrompt, normaliseStatus,
} from './types';

const BASE = 'https://backend.omnidim.io/api/v1';

export class OmniDimensionProvider implements VoiceProvider {
  readonly id = 'omnidimension' as const;
  readonly name = 'OmniDimension';

  private key(): string {
    return process.env.OMNIDIM_API_KEY || '';
  }

  async isConfigured(): Promise<boolean> {
    return !!this.key();
  }

  capabilities(): ProviderCapabilities {
    // knowledgeBase is false deliberately. OmniDimension does host its own
    // knowledge base (knowledge_base/create + knowledge_base/attach), but ours
    // lives in Postgres and is served to the worker over /api/internal — we
    // never upload documents to them, so advertising the capability would make
    // the UI offer a sync that does not happen.
    return { serverAgents: true, knowledgeBase: false, phoneNumbers: true, voiceCatalogue: true, webhooks: true };
  }

  /**
   * `notFoundIsNull` exists for the reconciliation poll. Everywhere else a 404
   * is a bug worth surfacing, but "OmniDimension has never heard of this call"
   * is a fact about the call, not a transport failure — the caller has to be
   * able to tell the two apart, because one means "leave the row alone" and the
   * other means "try again later".
   */
  private async request(
    path: string,
    init: RequestInit,
    opts?: { notFoundIsNull?: boolean }
  ): Promise<any> {
    const key = this.key();
    if (!key) throw new ProviderError('OmniDimension API key is not configured.', this.id, 503);

    const res = await fetch(`${BASE}/${path.replace(/^\//, '')}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init.headers || {}),
      },
    });

    if (res.status === 404 && opts?.notFoundIsNull) return null;

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new ProviderError(
        `OmniDimension request failed (${res.status})`,
        this.id,
        res.status === 401 || res.status === 403 ? 503 : 502,
        detail.slice(0, 400)
      );
    }
    return res.status === 204 ? {} : res.json().catch(() => ({}));
  }

  /**
   * Model ids are stored provider-qualified ("openai/gpt-4o-mini") because
   * LiveKit Inference needs the prefix. OmniDimension wants the bare name.
   */
  private static modelName(id: string | null | undefined): string {
    return (id || 'gpt-4o-mini').split('/').pop() || 'gpt-4o-mini';
  }

  /**
   * Voices are stored as "provider/voice_id" — OmniDimension needs both, and a
   * bare id is ambiguous across ElevenLabs, Google, Deepgram and the rest.
   * Older agents hold a bare id; assume ElevenLabs for those, which is the
   * catalogue's default provider.
   */
  private static voice(id: string | null | undefined): { provider: string; voice_id: string } | null {
    if (!id) return null;
    const slash = id.indexOf('/');
    if (slash === -1) return { provider: 'eleven_labs', voice_id: id };
    return { provider: id.slice(0, slash), voice_id: id.slice(slash + 1) };
  }

  /** OmniDimension models the prompt as titled context blocks. */
  private toAgentBody(config: AgentConfig): Record<string, any> {
    const sections = (config.sections ?? []).filter((s) => s.body?.trim());
    // is_enabled per block is what lets the builder switch a section off
    // without deleting it; omitting it makes every block permanently on.
    const context_breakdown = sections.length
      ? sections.map((s) => ({ title: s.title, body: s.body.trim(), is_enabled: true }))
      : [{ title: 'System Prompt', body: buildSystemPrompt(config), is_enabled: true }];

    const body: Record<string, any> = {
      name: config.name,
      context_breakdown,
      welcome_message: config.firstMessage || 'Hello!',
      // This platform only ever dials out.
      call_type: 'Outgoing',
      // Field name is `model.model`, not `model.name` — the latter is silently
      // ignored, leaving every agent on the account default.
      model: {
        model: OmniDimensionProvider.modelName(config.llmModel),
        temperature: config.temperature ?? 0.7,
      },
      transcriber: {
        provider: 'Soniox',
        silence_timeout_ms: 400,
        should_apply_noise_reduction: true,
      },
      is_interruption_allowed: true,
      // Ask for the transcript and summary to be pushed back after the call.
      // Without this the record shows a call happened and nothing about it.
      post_call_actions: {
        webhook: {
          enabled: true,
          include: ['summary', 'fullConversation', 'sentiment', 'extracted_variables'],
        },
      },
      end_call: {
        enabled: true,
        condition:
          'End the call when the customer says goodbye, asks to be removed, or the conversation is clearly finished.',
        message: 'Thank you for your time. Have a good day.',
      },
      user_idle: {
        threshold_sec: config.idleTimeoutSeconds ?? 10,
        last_message: 'I will let you go for now. Have a good day.',
      },
    };

    // Deliberately NOT sending a maximum call duration.
    //
    // Tested against a live account: `call_ending.max_duration_sec` and
    // `max_call_duration_in_sec` are both ignored on create — send 240 or 300
    // and the agent still reads back 600 — as is user_idle.threshold_sec, which
    // stays at 10 whatever is sent. OmniDimension enforces its own ten-minute
    // ceiling and exposes no hangup endpoint, so neither this adapter nor the
    // app can cut a live call short.
    //
    // What does work is `end_call` above: the agent hangs up on its own when
    // the conversation is finished, which is what ends the overwhelming
    // majority of calls long before any ceiling. Agent.maxCallSeconds is still
    // honoured by engines that accept it, and the campaign runner's stale-call
    // reaper releases the concurrency slot regardless.

    const voice = OmniDimensionProvider.voice(config.voiceId);
    if (voice) body.voice = voice;

    // Not in the SDK's named parameters, but forwarded through its **kwargs, so
    // the API accepts it. India-first deployments need the Hindi pairing.
    if (config.language) {
      body.languages =
        config.language === 'multi' ? ['English (India)', 'Hindi'] : [config.language];
    }

    if (config.webhookUrl) body.webhook_url = config.webhookUrl;
    if (config.transferEnabled && config.transferNumber) body.transfer_number = config.transferNumber;
    return body;
  }

  async createAgent(config: AgentConfig): Promise<{ externalAgentId: string }> {
    const data = await this.request('agents/create', { method: 'POST', body: JSON.stringify(this.toAgentBody(config)) });
    const id = data?.id ?? data?.agent_id ?? data?.json?.id ?? data?.agent?.id;
    if (id == null) throw new ProviderError('OmniDimension did not return an agent id.', this.id);
    return { externalAgentId: String(id) };
  }

  async updateAgent(externalAgentId: string, config: AgentConfig): Promise<void> {
    await this.request(`agents/${externalAgentId}`, { method: 'PUT', body: JSON.stringify(this.toAgentBody(config)) });
  }

  async deleteAgent(externalAgentId: string): Promise<void> {
    await this.request(`agents/${externalAgentId}`, { method: 'DELETE' });
  }

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    if (!params.externalAgentId) {
      throw new ProviderError('OmniDimension requires the agent to be synced before dialling.', this.id, 400);
    }
    const agentId = Number(params.externalAgentId);
    if (!Number.isFinite(agentId)) {
      throw new ProviderError(`Invalid OmniDimension agent id: ${params.externalAgentId}`, this.id, 400);
    }
    const to = params.to.startsWith('+') ? params.to : `+${params.to.replace(/\D/g, '')}`;

    // Resolve a caller id if the account has one, so it can be recorded against
    // the call and shown in the log.
    //
    // An empty list is NOT treated as fatal. Trial accounts dial from a shared
    // number that never appears in phone_number/list, so refusing here would
    // block the one path such an account has — better to send the dispatch and
    // let OmniDimension answer, since its rejection is the authoritative one
    // and is surfaced verbatim as the "not dispatched" reason.
    let from = params.fromNumberId ? { id: String(params.fromNumberId), number: null as string | null } : null;
    if (!from) {
      const numbers = await this.listPhoneNumbers().catch(() => []);
      if (numbers.length) from = { id: numbers[0].id, number: numbers[0].number ?? null };
    }

    const data = await this.request('calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        to_number: to,
        call_context: OmniDimensionProvider.callContext(params.metadata),
        // null is a valid value: it asks the account to use its default line.
        from_number_id: from ? Number(from.id) : null,
      }),
    });

    // Verified response: { success, status:"dispatched", requestId }
    const callId = data?.requestId ?? data?.call_id ?? data?.id;
    if (callId == null) throw new ProviderError('OmniDimension did not return a call id.', this.id);
    return {
      providerCallId: String(callId),
      status: normaliseStatus(data?.status),
      // Prefer whatever the dispatch response reports: on a trial account the
      // line used is only known after the fact.
      fromNumber: data?.from_number ?? from?.number ?? null,
    };
  }

  /**
   * No-op: the API exposes no hangup endpoint.
   *
   * The SDK's Call namespace is dispatch + log reads only, so a call ends when
   * the agent ends it or the customer hangs up. Previously this POSTed to
   * `calls/{id}/hangup` and swallowed the 404, which looked like it worked.
   * The campaign runner's stale-call reaper is what actually recovers a call
   * that never reports back.
   */
  async endCall(): Promise<void> {}

  /**
   * Voices known to work well for Indian outbound calling, offered first.
   *
   * The full catalogue runs to hundreds of entries in no useful order, and the
   * right choice for a Hindi/English lending call is not discoverable by
   * scrolling it. Ids carry their provider because OmniDimension needs both.
   */
  private static readonly PINNED: VoiceOption[] = [
    { id: 'eleven_labs/swh0hLPsEaD50F02tIJJ', name: 'ElevenLabs — Indian English (recommended)', provider: 'eleven_labs', language: 'en-IN' },
    { id: 'eleven_labs/IYUZs7LoFwd5QZsMgrMU', name: 'ElevenLabs — alternate', provider: 'eleven_labs', language: 'en-IN' },
    { id: 'google/en-in-Chirp3-HD-Achernar', name: 'Google Chirp3 HD — Achernar', provider: 'google', language: 'en-IN' },
    { id: 'google/en-in-Chirp3-HD-Achird', name: 'Google Chirp3 HD — Achird', provider: 'google', language: 'en-IN' },
  ];

  async listVoices(): Promise<VoiceOption[]> {
    let catalogue: VoiceOption[] = [];
    try {
      // page_size is explicit: the API defaults to 30, which silently truncates
      // a catalogue running to hundreds of voices.
      const data = await this.request('providers/voices?page=1&page_size=200', { method: 'GET' });
      const raw = Array.isArray(data) ? data : data?.voices || data?.json?.voices || [];
      if (Array.isArray(raw)) {
        catalogue = raw.map((v: any) => {
          const service = v.service ?? v.provider ?? 'eleven_labs';
          const voiceId = String(v.voice_id ?? v.name ?? v.id);
          return {
            // Qualified so the dial-time payload can name the provider.
            id: `${service}/${voiceId}`,
            // display_name is the human one ("luna"); name is the technical id
            // ("aura-luna-en"). Show the friendly one, fall back to the other.
            name: v.display_name ?? v.name ?? voiceId,
            provider: service,
            language: v.language ?? v.accent,
            gender: v.gender,
            previewUrl: v.sample_url ?? v.preview_url,
          };
        });
      }
    } catch {
      /* the pinned list still gives the builder something usable */
    }

    const seen = new Set(OmniDimensionProvider.PINNED.map((v) => v.id));
    return [...OmniDimensionProvider.PINNED, ...catalogue.filter((v) => !seen.has(v.id))];
  }

  async listModels(): Promise<ModelOption[]> {
    // Three separate endpoints, one per stage of the pipeline. There is no
    // combined `providers/models` route — the previous implementation called
    // one and always got a 404, so the model list was permanently empty.
    const sources: { path: string; kind: ModelOption['kind']; key: string }[] = [
      { path: 'providers/llms', kind: 'llm', key: 'llms' },
      { path: 'providers/stt', kind: 'stt', key: 'stt' },
      { path: 'providers/tts', kind: 'tts', key: 'tts' },
    ];

    const results = await Promise.all(
      sources.map(async ({ path, kind, key }) => {
        try {
          const data = await this.request(path, { method: 'GET' });
          const raw = Array.isArray(data)
            ? data
            : data?.[key] || data?.models || data?.providers || data?.json?.[key] || [];
          if (!Array.isArray(raw)) return [];
          return raw
            .filter((m: any) => m?.is_active !== false)
            .map((m: any) => ({
              // The numeric `id` is internal; `name` ("azure-gpt-4.1-nano") is
              // what agents/create expects in its model/voice fields, so that is
              // what we store on the agent.
              id: String(m.name ?? m.id),
              name: m.provider_name ? `${m.name} (${m.provider_name})` : String(m.name ?? m.id),
              kind,
            }));
        } catch {
          // One stage being unavailable shouldn't empty the whole list.
          return [];
        }
      })
    );

    return results.flat();
  }

  /** Assign one of the account's numbers to a synced agent. */
  async attachPhoneNumber(phoneNumberId: string, externalAgentId: string): Promise<void> {
    await this.request('phone_number/attach', {
      method: 'POST',
      body: JSON.stringify({
        phone_number_id: Number(phoneNumberId),
        agent_id: Number(externalAgentId),
      }),
    });
  }

  async listLanguages(): Promise<LanguageOption[]> {
    // OmniDimension is multilingual; expose the India-relevant set.
    return [
      { code: 'multi', name: 'Multilingual (auto)' },
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
      { code: 'ta', name: 'Tamil' },
      { code: 'te', name: 'Telugu' },
      { code: 'mr', name: 'Marathi' },
    ];
  }

  async listPhoneNumbers(): Promise<PhoneNumberOption[]> {
    try {
      const data = await this.request('phone_number/list?page=1&page_size=100', { method: 'GET' });
      const raw = Array.isArray(data) ? data : data?.phone_numbers || data?.numbers || [];
      if (Array.isArray(raw) && raw.length) {
        return raw.map((n: any) => ({
          id: String(n.id),
          number: n.number ?? n.phone_number,
          label: n.label,
          country: n.country,
        }));
      }
    } catch {
      /* fall through */
    }
    return [];
  }

  // -------------------------------------------------------------------------
  // Result normalisation
  //
  // The webhook and the reconciliation poll describe the SAME call, so they
  // share one mapper. Two mappers would drift, and a polled call would then
  // disagree with a delivered one about its own transcript — the exact class of
  // bug that is impossible to spot, because whichever path ran is invisible
  // from the record it produced.
  // -------------------------------------------------------------------------

  /** First present, non-empty value among several spellings of one field. */
  private static pick(source: any, keys: string[]): any {
    if (!source || typeof source !== 'object') return undefined;
    for (const key of keys) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return undefined;
  }

  /** Coerce a value that may arrive as text, a number or a list into text. */
  private static text(value: any): string | null {
    if (value == null) return null;
    if (Array.isArray(value)) {
      const joined = value
        .map((v) =>
          v && typeof v === 'object'
            ? String(v.text ?? v.value ?? v.objection ?? v.name ?? '').trim()
            : String(v ?? '').trim()
        )
        .filter(Boolean)
        .join('; ');
      return joined || null;
    }
    if (typeof value === 'object') return null;
    const s = String(value).trim();
    return s || null;
  }

  /**
   * Post-call variables the agent extracted. Delivered as an object on the
   * webhook and as a list of {key, value} pairs on some log rows, so both are
   * flattened to a plain lookup before anything reads from them.
   */
  private static extracted(payload: any): Record<string, any> {
    const raw = OmniDimensionProvider.pick(payload, [
      'extracted_variables', 'extractedVariables', 'variables',
    ]);
    if (!raw) return {};
    if (Array.isArray(raw)) {
      const out: Record<string, any> = {};
      for (const item of raw) {
        const key = item?.key ?? item?.name ?? item?.variable;
        if (key) out[String(key)] = item?.value ?? item?.val ?? null;
      }
      return out;
    }
    return typeof raw === 'object' ? (raw as Record<string, any>) : {};
  }

  /**
   * Pull the conversation out of a post-call payload.
   *
   * `post_call_actions.webhook` delivers it as `fullConversation`, but the key
   * and shape vary across event types and across the call-log endpoint (array
   * of turns, a wrapper object around them, one blob of text, or that array
   * JSON-encoded into a string), so every known form is normalised to the
   * {role, text} turns the call record renders. Getting this wrong shows a
   * completed call with an empty transcript, which is indistinguishable from a
   * call nobody spoke on.
   */
  private static conversation(payload: any): {
    turns: { role: string; text: string }[] | null;
    text: string | null;
  } {
    // Best source by far: the call log carries a structured turn list, so the
    // transcript can be rebuilt without parsing prose. Each entry pairs what the
    // customer said with the agent's reply, in that order.
    const interactions = payload?.interactions;
    if (Array.isArray(interactions) && interactions.length) {
      const ordered = [...interactions].sort(
        (a, b) => Number(a?.interaction_sequence ?? 0) - Number(b?.interaction_sequence ?? 0)
      );
      const turns: { role: string; text: string }[] = [];
      for (const it of ordered) {
        const asked = String(it?.user_query ?? '').trim();
        const said = String(it?.bot_response ?? '').trim();
        if (asked) turns.push({ role: 'user', text: asked });
        if (said) turns.push({ role: 'assistant', text: said });
      }
      if (turns.length) return { turns, text: OmniDimensionProvider.render(turns) };
    }

    let raw: any = OmniDimensionProvider.pick(payload, [
      // `call_conversation` is what the REST log actually uses; the camelCase
      // spellings below are the webhook's. Omitting this one meant every
      // reconciled call arrived with an empty transcript.
      'call_conversation',
      'fullConversation', 'full_conversation', 'conversation', 'transcript',
    ]);
    if (!raw) return { turns: null, text: null };

    // The log renders the conversation as one HTML-ish string:
    //   "LLM: Hi there.<br/>User: Who is this?<br/>"
    // Split it back into turns rather than storing markup the UI would have to
    // render as text.
    if (typeof raw === 'string' && /<br\s*\/?>/i.test(raw)) {
      const turns = raw
        .split(/<br\s*\/?>/i)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const m = line.match(/^(LLM|Bot|Agent|Assistant|User|Customer|Human)\s*:\s*(.*)$/is);
          if (!m) return { role: 'assistant', text: line };
          const who = m[1].toLowerCase();
          return {
            role: /user|customer|human/.test(who) ? 'user' : 'assistant',
            text: m[2].trim(),
          };
        })
        .filter((t) => t.text);
      if (turns.length) return { turns, text: OmniDimensionProvider.render(turns) };
    }

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      // Some events carry the turns JSON-encoded rather than as JSON.
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          raw = JSON.parse(trimmed);
        } catch {
          return { turns: null, text: trimmed || null };
        }
      } else {
        return { turns: null, text: trimmed || null };
      }
    }

    // A wrapper around the turns rather than the turns themselves.
    if (raw && !Array.isArray(raw) && typeof raw === 'object') {
      raw = OmniDimensionProvider.pick(raw, ['turns', 'messages', 'conversation', 'transcript', 'items']);
      if (typeof raw === 'string') return { turns: null, text: raw.trim() || null };
    }

    if (Array.isArray(raw)) {
      const turns = raw
        .map((t: any) => {
          if (typeof t === 'string') {
            const line = t.trim();
            return line ? { role: 'assistant', text: line } : null;
          }
          const speaker = String(t?.role ?? t?.speaker ?? t?.from ?? '').toLowerCase();
          const text = String(t?.text ?? t?.content ?? t?.message ?? '').trim();
          if (!text) return null;
          // Anything that is not clearly the customer is the agent: an unknown
          // label rendered as "Customer" would misattribute what was said.
          const role = /user|customer|human|caller/.test(speaker) ? 'user' : 'assistant';
          return { role, text };
        })
        .filter((t): t is { role: string; text: string } => t !== null);

      if (!turns.length) return { turns: null, text: null };
      return { turns, text: OmniDimensionProvider.render(turns) };
    }

    return { turns: null, text: null };
  }

  /** One readable transcript line per turn, for search and for download. */
  private static render(turns: { role: string; text: string }[]): string {
    return turns.map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.text}`).join('\n');
  }

  /**
   * Who ended the call, and why, in one line.
   *
   * "End call tool invoked" alone does not say whether the agent decided the
   * conversation was finished or the customer rang off, and that difference is
   * the whole story when reviewing a short call.
   */
  private static hangup(payload: any): string | null {
    const reason = OmniDimensionProvider.text(payload?.hangup_reason);
    const source = OmniDimensionProvider.text(payload?.hangup_source);
    if (!reason && !source) return null;
    const who = source === 'bot' ? 'Agent' : source === 'user' ? 'Customer' : null;
    if (reason && who) return `${reason} (${who.toLowerCase()} hung up)`;
    return reason ?? `${who} hung up`;
  }

  /**
   * The context sent with a dispatch, and echoed back on every webhook.
   *
   * Two spellings have to be right here or the call is visibly wrong:
   *
   * `customer_name` — OmniDimension substitutes `{{customer_name}}` in the
   * opening line from these keys. Our callers hold it as `customerName`, so
   * without the snake_case alias the customer literally hears "Hi
   * {{customer_name}}, Priya here" as the first words of the call.
   *
   * `callId` — parseWebhook looks for `ctx.callId` to match an event back to
   * our Call row, but callers put it in as `callLogId`, so every inbound event
   * was being discarded as unrecognised.
   *
   * Both aliases are added rather than renamed, so anything already reading the
   * original keys keeps working.
   */
  private static callContext(metadata: any): Record<string, any> {
    const meta = (metadata && typeof metadata === 'object' ? metadata : {}) as Record<string, any>;
    const out: Record<string, any> = { ...meta };

    // "there" rather than blank, so a nameless lead is greeted with "Hi there,
    // this is Priya…" instead of "Hi , this is Priya…". Plenty of imported rows
    // carry only a phone number, and the alternative is an audible stumble in
    // the first second of every one of those calls. This is a greeting fallback
    // only — nothing writes it back to the contact.
    const name = OmniDimensionProvider.text(meta.customerName ?? meta.customer_name);
    out.customer_name = name ?? 'there';

    const callId = meta.callLogId ?? meta.callId;
    if (callId != null) out.callId = String(callId);

    return out;
  }

  /** Resolve a provider-relative URL against OmniDimension's own host. */
  private static absolute(url: string | null | undefined): string | null {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return `https://omnidim.io${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * Finished-call payload -> CallReport. The one mapper, used by both the
   * webhook parser and the poll.
   */
  private static toReport(payload: any): CallReport {
    const pick = OmniDimensionProvider.pick;
    const text = OmniDimensionProvider.text;
    const vars = OmniDimensionProvider.extracted(payload);
    const conversation = OmniDimensionProvider.conversation(payload);

    const sentiment = text(
      pick(payload, ['sentiment', 'call_sentiment', 'sentiment_score']) ?? pick(vars, ['sentiment'])
    );
    const qualified =
      pick(payload, ['lead_qualified', 'is_qualified']) ??
      pick(vars, ['lead_qualified', 'is_qualified', 'interested']);

    // `call_duration` is a display string ("2.00:49.00" for two minutes and
    // forty-nine seconds), so Number() on it yields NaN and every call was
    // recorded as lasting zero seconds. The log carries the value split into
    // clean integers alongside it; use those and fall back to the loose fields
    // only for payload shapes that lack them (the webhook's, for instance).
    const mins = Number(pick(payload, ['call_duration_in_minutes']) ?? NaN);
    const secs = Number(pick(payload, ['call_duration_in_seconds']) ?? NaN);
    const duration = Number.isFinite(secs)
      ? (Number.isFinite(mins) ? mins * 60 : 0) + secs
      : Number(pick(payload, ['duration', 'duration_seconds', 'callDuration']) ?? 0);
    const score = Number(pick(payload, ['lead_score']) ?? pick(vars, ['lead_score', 'score']) ?? NaN);

    return {
      durationSec: Number.isFinite(duration) ? Math.max(0, Math.round(duration)) : 0,
      // Who hung up and why is the most useful thing on the record when a call
      // goes wrong, and the log states both.
      endedReason:
        OmniDimensionProvider.hangup(payload) ??
        text(pick(payload, ['end_reason', 'endReason', 'call_end_reason', 'disconnection_reason'])) ??
        'Completed',
      // `internal_recording_url` is absolute; `recording_url` is a bare path
      // that resolves against this app when put in an <audio src>, so it 404s.
      recordingUrl:
        text(pick(payload, ['internal_recording_url'])) ??
        OmniDimensionProvider.absolute(
          text(pick(payload, ['recording_url', 'recordingUrl', 'audio_url', 'call_recording_url']))
        ),
      fromNumber: text(pick(payload, ['from_number', 'fromNumber', 'caller_id'])),
      transcript: conversation.turns,
      transcriptText: conversation.text,
      summary:
        text(pick(payload, ['call_summary', 'summary', 'conversation_summary'])) ??
        text(pick(vars, ['summary'])) ??
        // The REST log has no summary field, but its sentiment analysis opens
        // with a narrative of what was actually said, which is the closest
        // thing to one and far better than showing nothing.
        text(pick(payload, ['sentiment_analysis_details'])),
      // A string "true" counts: extracted variables come back as text.
      interested:
        (sentiment ?? '').toLowerCase() === 'positive' ||
        qualified === true ||
        String(qualified).toLowerCase() === 'true',
      leadStatus: text(pick(payload, ['lead_status'])) ?? text(pick(vars, ['lead_status', 'leadStatus'])),
      leadScore: Number.isFinite(score) ? Math.round(score) : null,
      sentiment,
      customerIntent:
        text(pick(payload, ['intent', 'customer_intent'])) ??
        text(pick(vars, ['intent', 'customer_intent'])),
      nextAction:
        text(pick(payload, ['next_action'])) ?? text(pick(vars, ['next_action', 'nextAction'])),
      objections: text(pick(payload, ['objections'])) ?? text(pick(vars, ['objections'])),
    };
  }

  /**
   * Find the call log a dispatch produced, by its request id.
   *
   * Only the recent pages are searched. A call being reconciled was dispatched
   * minutes ago, so it is at the front of a list ordered newest-first; walking
   * the whole history to find a call that has not been logged yet would cost
   * many requests per pass and still come back empty.
   */
  private async findLogByRequestId(requestId: string): Promise<any | null> {
    const wanted = String(requestId);

    for (let page = 1; page <= 3; page++) {
      const data = await this.request(
        `calls/logs?page=${page}&page_size=100`,
        { method: 'GET' },
        { notFoundIsNull: true }
      ).catch(() => null);

      const rows: any[] = Array.isArray(data?.call_log_data) ? data.call_log_data : [];
      if (!rows.length) return null;

      const hit = rows.find((r) => {
        const req = r?.call_request_id;
        const id = req && typeof req === 'object' ? req.id : req;
        return id != null && String(id) === wanted;
      });
      if (hit) return hit;

      // Short page means the list is exhausted; no point asking for the next.
      if (rows.length < 100) return null;
    }
    return null;
  }

  /**
   * The call-log endpoint wraps its row differently depending on the account
   * and the SDK version, so the row is located rather than assumed. A body that
   * holds no recognisable log row (an error object, an empty envelope) yields
   * null, which the caller reads as "nothing learned".
   */
  private static unwrapLog(data: any): any | null {
    if (!data || typeof data !== 'object') return null;
    if (data.success === false) return null;

    // `calls/logs/{id}` answers with the *list* envelope narrowed to one row —
    // { call_log_data: [ … ], total_records: n } — not with the row itself.
    // Nothing below matches that shape (the loop skips arrays outright), so
    // every lookup used to fall through and return null, which the reconciler
    // reads as "the engine has no record of this call". The effect was that no
    // call ever reconciled: transcripts, recordings and summaries were fetched
    // successfully and then silently discarded.
    //
    // An unknown id is not a 404 here, it is a 200 carrying an empty array, so
    // an empty list is the genuine "no such call" answer and must stay null.
    if (Array.isArray(data.call_log_data)) return data.call_log_data[0] ?? null;
    if (Array.isArray(data.logs)) return data.logs[0] ?? null;
    if (Array.isArray(data)) return (data as any[])[0] ?? null;

    const candidates = [data.json, data.data, data.call_log, data.callLog, data.log, data.call, data.result, data];
    for (const c of candidates) {
      if (!c || typeof c !== 'object' || Array.isArray(c)) continue;
      const looksLikeLog =
        c.call_status != null || c.call_id != null || c.fullConversation != null ||
        c.full_conversation != null || c.call_summary != null ||
        (c.id != null && c !== data);
      if (looksLikeLog) return c;
    }
    // The top level may still be the row itself, with only an id to prove it.
    // A numeric `status` is the envelope's HTTP code, not the call's, so only a
    // textual one counts — otherwise a bare `{success:true,status:200}` would be
    // read as a live call and the row would be moved on the strength of nothing.
    return data.id != null || typeof data.status === 'string' ? data : null;
  }

  /**
   * Canonical status for a log row.
   *
   * `normaliseStatus` deliberately answers "initiated" for a word it does not
   * recognise, so the campaign runner can never over-dial by assuming a live
   * call ended. Here that same default has the opposite cost: it would strand a
   * finished call in flight forever. So when the vendor's word is missing or
   * unrecognised, evidence that the call produced an outcome wins.
   */
  private static logStatus(log: any): CallStatus {
    const raw = OmniDimensionProvider.pick(log, ['call_status', 'status', 'call_state', 'state']);
    const explicit = raw != null ? normaliseStatus(String(raw)) : null;
    if (explicit && explicit !== 'initiated') return explicit;

    // Duration is deliberately not evidence: a live call reports elapsed
    // seconds too, and treating that as an ending would cut the record short.
    const ended = OmniDimensionProvider.pick(log, [
      'fullConversation', 'full_conversation', 'conversation', 'transcript',
      'call_summary', 'summary', 'end_time', 'ended_at', 'call_end_time', 'end_reason',
    ]);
    if (ended) return 'completed';

    return explicit ?? 'in_progress';
  }

  /**
   * Ask OmniDimension what became of a call we dispatched.
   *
   * The dispatch `requestId` we store as providerCallId is the id this log is
   * keyed by. A 404 means the account has no such call — the row is left to the
   * stale reaper rather than being guessed at — while anything else throws, so
   * a blip is retried on the next pass instead of being recorded as an outcome.
   */
  async fetchCallResult(providerCallId: string): Promise<FetchedCallResult | null> {
    const id = String(providerCallId ?? '').trim();
    if (!id) return null;

    const data = await this.request(
      `calls/logs/${encodeURIComponent(id)}`,
      { method: 'GET' },
      { notFoundIsNull: true }
    );

    // Two different id namespaces are in play. `calls/dispatch` answers with a
    // *request* id (what we store as providerCallId), while `calls/logs/{id}`
    // is keyed by the *log* id — a different number entirely. The two are
    // linked only by `call_request_id.id` on the log row.
    //
    // So a direct lookup by the id we hold returns an empty list rather than a
    // 404, and every reconcile concluded the engine had never heard of the
    // call. Fall back to finding the row whose request id matches ours.
    let log = data == null ? null : OmniDimensionProvider.unwrapLog(data);
    if (!log) log = await this.findLogByRequestId(id);
    if (!log) return null;

    const status = OmniDimensionProvider.logStatus(log);
    if (status !== 'completed' && status !== 'failed') return { status };

    const report = OmniDimensionProvider.toReport(log);

    if (status === 'failed') {
      // A call that never connected is retryable, and only the lead status says
      // so. Left blank it would resolve to "unknown", which stops the contact
      // dead as though the conversation had happened and gone nowhere.
      if (!report.leadStatus) report.leadStatus = 'no_answer';
      // The shared mapper falls back to "Completed", which is the wrong story
      // for a call that did not complete. OmniDimension's own word for the
      // ending ("busy", "no-answer") is what someone reading the log needs.
      report.endedReason =
        OmniDimensionProvider.text(
          OmniDimensionProvider.pick(log, [
            'end_reason', 'endReason', 'call_end_reason', 'disconnection_reason',
            'call_status', 'status',
          ])
        ) ?? 'the provider reported no outcome';
    }

    return { status, report };
  }

  parseWebhook(payload: any): VoiceEvent {
    // OmniDimension echoes call_context back on its events.
    const ctx = payload?.call_context ?? payload?.context ?? payload?.data?.call_context ?? {};
    const callId: string | undefined = ctx.callId ?? payload?.metadata?.callId;
    if (!callId) return { kind: 'ignored' };

    const type = payload?.event ?? payload?.type ?? payload?.status;

    if (['call_started', 'ringing', 'in-progress', 'call_connected'].includes(type)) {
      return { kind: 'status', callId, status: normaliseStatus(String(type)) };
    }
    if (type === 'transcript' || payload?.transcript_chunk) {
      return { kind: 'transcript', callId, transcript: payload.transcript_chunk || payload.transcript || '' };
    }
    if (['call_ended', 'completed'].includes(type) || payload?.call_summary || payload?.fullConversation) {
      return { kind: 'end', callId, report: OmniDimensionProvider.toReport(payload) };
    }
    return { kind: 'ignored', callId };
  }
}
