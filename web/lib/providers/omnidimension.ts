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
  AgentConfig, CallReport, LanguageOption, ModelOption, PhoneNumberOption,
  ProviderCapabilities, ProviderError, StartCallParams, StartCallResult,
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

  private async request(path: string, init: RequestInit): Promise<any> {
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
    };

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
        call_context: params.metadata, // round-tripped back on the webhook
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

  /**
   * Pull the conversation out of a post-call payload.
   *
   * `post_call_actions.webhook` delivers it as `fullConversation`, but the key
   * and shape vary across event types (array of turns, or one blob of text), so
   * every known form is normalised to the {role, text} turns the call record
   * renders. Getting this wrong shows a completed call with an empty
   * transcript, which is indistinguishable from a call nobody spoke on.
   */
  private static conversation(payload: any): {
    turns: { role: string; text: string }[] | null;
    text: string | null;
  } {
    const raw =
      payload?.fullConversation ??
      payload?.full_conversation ??
      payload?.conversation ??
      payload?.transcript ??
      null;

    if (!raw) return { turns: null, text: null };

    if (typeof raw === 'string') {
      return { turns: null, text: raw };
    }

    if (Array.isArray(raw)) {
      const turns = raw
        .map((t: any) => {
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
      return {
        turns,
        text: turns.map((t) => `${t.role === 'user' ? 'Customer' : 'Agent'}: ${t.text}`).join('\n'),
      };
    }

    return { turns: null, text: null };
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
      const sentiment = String(payload?.sentiment ?? '').toLowerCase();
      const conversation = OmniDimensionProvider.conversation(payload);
      const report: CallReport = {
        durationSec: Number(payload?.duration ?? payload?.call_duration ?? 0) || 0,
        endedReason: payload?.end_reason || 'Completed',
        recordingUrl: payload?.recording_url || null,
        transcript: conversation.turns,
        transcriptText: conversation.text,
        summary: payload?.call_summary || payload?.summary || null,
        interested: sentiment === 'positive' || payload?.lead_qualified === true,
        leadStatus: payload?.lead_status || null,
        leadScore: payload?.lead_score ?? null,
        sentiment: payload?.sentiment || null,
        customerIntent: payload?.intent || null,
        nextAction: payload?.next_action || null,
        objections: payload?.objections || null,
      };
      return { kind: 'end', callId, report };
    }
    return { kind: 'ignored', callId };
  }
}
