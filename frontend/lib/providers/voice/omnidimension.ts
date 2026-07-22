// OmniDimension adapter.
//
// Contract verified against the official Python SDK (omnidimension 0.2.17):
//   base   https://backend.omnidim.io/api/v1
//   auth   Authorization: Bearer <key>
//   POST   agents/create   { name, context_breakdown: [{title, body}], welcome_message }
//   PUT    agents/{id}
//   DELETE agents/{id}
//   POST   calls/dispatch  { agent_id:int, to_number:"+…", call_context:{}, from_number_id:int|null }
//   GET    calls/logs/{id}
//
// Note: OmniDimension agent ids are integers, unlike Vapi's UUID strings. We
// store them as strings and coerce at the boundary.
import { getApiKey } from '../../providers';
import { buildSystemPrompt } from './vapi';
import {
  CallEndReport,
  StartCallParams,
  StartCallResult,
  VoiceAgentConfig,
  VoiceOption,
  VoiceProvider,
  VoiceProviderError,
  VoiceWebhookEvent,
  normaliseCallStatus,
} from './types';

const BASE = 'https://backend.omnidim.io/api/v1';

export class OmniDimensionProvider implements VoiceProvider {
  readonly id = 'omnidimension' as const;
  readonly name = 'OmniDimension';

  private async key(): Promise<string> {
    return getApiKey('omnidimension', 'OMNIDIM_API_KEY');
  }

  async isConfigured(): Promise<boolean> {
    try {
      return !!(await this.key());
    } catch {
      return false;
    }
  }

  private async request(path: string, init: RequestInit): Promise<any> {
    const key = await this.key();
    if (!key) {
      throw new VoiceProviderError('OmniDimension API key is not configured.', this.id, 503);
    }

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
      throw new VoiceProviderError(
        `OmniDimension request failed (${res.status})`,
        this.id,
        res.status === 401 || res.status === 403 ? 503 : 502,
        detail.slice(0, 400)
      );
    }

    return res.status === 204 ? {} : res.json().catch(() => ({}));
  }

  /**
   * OmniDimension models the prompt as titled context blocks, which maps
   * directly onto our structured prompt builder.
   */
  private toAgentBody(config: VoiceAgentConfig): Record<string, any> {
    const sections = (config.sections || []).filter((s) => s.body?.trim());

    const context_breakdown = sections.length
      ? sections.map((s) => ({ title: s.title, body: s.body.trim() }))
      : [{ title: 'System Prompt', body: buildSystemPrompt(config) }];

    const body: Record<string, any> = {
      name: config.name,
      context_breakdown,
      welcome_message: config.firstMessage || 'Hello!',
    };

    if (config.model) {
      body.model = { provider: config.llmProvider || 'openai', name: config.model };
      if (config.temperature != null) body.model.temperature = config.temperature;
    }
    if (config.voiceId) {
      body.voice = { provider: config.voiceProvider || 'eleven_labs', voice_id: config.voiceId };
    }
    if (config.sttProvider) {
      body.transcriber = {
        provider: config.sttProvider,
        ...(config.sttModel ? { model: config.sttModel } : {}),
      };
    }
    if (config.language) body.language = config.language;
    if (config.serverUrl) body.webhook_url = config.serverUrl;
    if (config.transferEnabled && config.transferNumber) {
      body.transfer_number = config.transferNumber;
    }

    return body;
  }

  async createAgent(config: VoiceAgentConfig): Promise<{ externalAgentId: string }> {
    const data = await this.request('agents/create', {
      method: 'POST',
      body: JSON.stringify(this.toAgentBody(config)),
    });

    const id = data?.id ?? data?.agent_id ?? data?.json?.id ?? data?.agent?.id;
    if (id == null) {
      throw new VoiceProviderError('OmniDimension did not return an agent id.', this.id);
    }
    return { externalAgentId: String(id) };
  }

  async updateAgent(externalAgentId: string, config: VoiceAgentConfig): Promise<void> {
    await this.request(`agents/${externalAgentId}`, {
      method: 'PUT',
      body: JSON.stringify(this.toAgentBody(config)),
    });
  }

  async deleteAgent(externalAgentId: string): Promise<void> {
    await this.request(`agents/${externalAgentId}`, { method: 'DELETE' });
  }

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    if (!params.externalAgentId) {
      throw new VoiceProviderError(
        'OmniDimension requires the agent to be synced before dialling.',
        this.id,
        400
      );
    }

    const agentId = Number(params.externalAgentId);
    if (!Number.isFinite(agentId)) {
      throw new VoiceProviderError(
        `Invalid OmniDimension agent id: ${params.externalAgentId}`,
        this.id,
        400
      );
    }

    // OmniDimension validates that the destination is E.164.
    const to = params.to.startsWith('+') ? params.to : `+${params.to.replace(/\D/g, '')}`;

    const data = await this.request('calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({
        agent_id: agentId,
        to_number: to,
        // Round-tripped back to us on the webhook so we can find the CallLog.
        call_context: params.metadata,
        from_number_id: params.fromNumberId ? Number(params.fromNumberId) : null,
      }),
    });

    // Verified against the official OpenAPI schema (@omnidim-ai/sdk):
    //   { success, status: "dispatched", requestId, custom_variables_count }
    // `requestId` correlates with `call_request_id` on /calls/logs.
    const callId = data?.requestId ?? data?.call_id ?? data?.id;
    if (callId == null) {
      throw new VoiceProviderError('OmniDimension did not return a call id.', this.id);
    }
    return {
      providerCallId: String(callId),
      status: normaliseCallStatus(data?.status),
    };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.request(`calls/${providerCallId}/hangup`, { method: 'POST' });
  }

  async listVoices(): Promise<VoiceOption[]> {
    try {
      const data = await this.request('providers/voices', { method: 'GET' });
      const raw = Array.isArray(data) ? data : data?.voices || data?.json?.voices || [];
      if (Array.isArray(raw) && raw.length) {
        return raw.map((v: any) => ({
          id: String(v.voice_id ?? v.id),
          name: v.name ?? String(v.voice_id ?? v.id),
          provider: v.provider ?? 'omnidimension',
          language: v.language,
          gender: v.gender,
        }));
      }
    } catch {
      // Fall through to defaults when the catalogue endpoint is unavailable.
    }
    return [
      { id: 'default', name: 'Default', provider: 'omnidimension', language: 'en' },
    ];
  }

  parseWebhook(payload: any): VoiceWebhookEvent {
    // OmniDimension echoes call_context back on its events.
    const ctx = payload?.call_context ?? payload?.context ?? payload?.data?.call_context ?? {};
    const callLogId: string | undefined = ctx.callLogId ?? payload?.metadata?.callLogId;
    if (!callLogId) return { kind: 'ignored' };

    const type = payload?.event ?? payload?.type ?? payload?.status;

    if (type === 'call_started' || type === 'ringing' || type === 'in-progress') {
      return { kind: 'status', callLogId, status: normaliseCallStatus(String(type)) };
    }

    if (type === 'transcript' || payload?.transcript_chunk) {
      return {
        kind: 'transcript',
        callLogId,
        transcript: payload.transcript_chunk || payload.transcript || '',
      };
    }

    if (type === 'call_ended' || type === 'completed' || payload?.call_summary) {
      const sentiment = String(payload?.sentiment ?? '').toLowerCase();
      const report: CallEndReport = {
        durationSec: Number(payload?.duration ?? payload?.call_duration ?? 0) || 0,
        endedReason: payload?.end_reason || 'Completed',
        recordingUrl: payload?.recording_url || null,
        transcriptJson: JSON.stringify(payload?.transcript ?? []),
        summary: payload?.call_summary || payload?.summary || null,
        interested: sentiment === 'positive' || payload?.lead_qualified === true,
        customerIntent: payload?.intent || null,
        nextAction: payload?.next_action || null,
        objections: payload?.objections || null,
      };
      return { kind: 'end-of-call', callLogId, report };
    }

    return { kind: 'ignored', callLogId };
  }
}
