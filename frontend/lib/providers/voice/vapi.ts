// Vapi adapter. https://docs.vapi.ai/api-reference
//
// Vapi is an orchestration layer: it does not do STT/LLM/TTS itself, it routes
// to whichever vendor the assistant config names. That is why transcriber /
// model / voice are three independently configurable blocks below.
import { getApiKey } from '../../providers';
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

const BASE = 'https://api.vapi.ai';

/**
 * Vapi rejects unknown voice providers. `exote` was being sent by older builds
 * (a typo for exotel, which is telephony, not TTS) and silently broke assistant
 * creation, so map anything unrecognised onto a safe default.
 */
const VAPI_VOICE_PROVIDERS = new Set([
  '11labs', 'azure', 'cartesia', 'deepgram', 'lmnt', 'neets',
  'openai', 'playht', 'rime-ai', 'smallest-ai',
]);

function normaliseVoiceProvider(provider?: string | null): string {
  if (!provider) return '11labs';
  const p = provider.toLowerCase();
  if (p === 'elevenlabs') return '11labs';
  return VAPI_VOICE_PROVIDERS.has(p) ? p : '11labs';
}

export class VapiProvider implements VoiceProvider {
  readonly id = 'vapi' as const;
  readonly name = 'Vapi';

  private async key(): Promise<string> {
    return getApiKey('vapi', 'VAPI_API_KEY');
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
      throw new VoiceProviderError('Vapi API key is not configured.', this.id, 503);
    }

    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new VoiceProviderError(
        `Vapi request failed (${res.status})`,
        this.id,
        res.status === 401 || res.status === 403 ? 503 : 502,
        detail.slice(0, 400)
      );
    }

    return res.status === 204 ? {} : res.json().catch(() => ({}));
  }

  /** Translate our neutral config into a Vapi assistant body. */
  private toAssistant(config: VoiceAgentConfig): Record<string, any> {
    const prompt = buildSystemPrompt(config);

    const assistant: Record<string, any> = {
      name: config.name,
      firstMessage: config.firstMessage || 'Hello!',
      model: {
        provider: config.llmProvider || 'openai',
        model: config.model || 'gpt-4o',
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 500,
        messages: [{ role: 'system', content: prompt }],
      },
      voice: {
        provider: normaliseVoiceProvider(config.voiceProvider),
        voiceId: config.voiceId || 'burt',
      },
    };

    if (config.sttProvider) {
      assistant.transcriber = {
        provider: config.sttProvider,
        ...(config.sttModel ? { model: config.sttModel } : {}),
        ...(config.language ? { language: config.language.split('-')[0] } : {}),
      };
    }

    if (config.silenceTimeout) {
      // Our UI stores seconds; Vapi expects seconds too, but older rows stored ms.
      const secs = config.silenceTimeout > 120 ? config.silenceTimeout / 1000 : config.silenceTimeout;
      assistant.silenceTimeoutSeconds = Math.min(Math.max(Math.round(secs), 10), 3600);
    }

    if (config.serverUrl) assistant.server = { url: config.serverUrl };

    if (config.transferEnabled && config.transferNumber) {
      assistant.forwardingPhoneNumber = config.transferNumber;
    }

    return assistant;
  }

  async createAgent(config: VoiceAgentConfig): Promise<{ externalAgentId: string }> {
    const data = await this.request('/assistant', {
      method: 'POST',
      body: JSON.stringify(this.toAssistant(config)),
    });
    if (!data?.id) {
      throw new VoiceProviderError('Vapi did not return an assistant id.', this.id);
    }
    return { externalAgentId: data.id };
  }

  async updateAgent(externalAgentId: string, config: VoiceAgentConfig): Promise<void> {
    await this.request(`/assistant/${externalAgentId}`, {
      method: 'PATCH',
      body: JSON.stringify(this.toAssistant(config)),
    });
  }

  async deleteAgent(externalAgentId: string): Promise<void> {
    await this.request(`/assistant/${externalAgentId}`, { method: 'DELETE' });
  }

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    const body: Record<string, any> = { customer: { number: params.to } };

    if (params.externalAgentId) {
      body.assistantId = params.externalAgentId;
      body.assistantOverrides = { metadata: params.metadata };
    } else {
      body.assistant = { ...this.toAssistant(params.config), metadata: params.metadata };
    }

    const phoneNumberId = params.fromNumberId || process.env.VAPI_PHONE_NUMBER_ID;
    if (phoneNumberId) body.phoneNumberId = phoneNumberId;

    const call = await this.request('/call/phone', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (!call?.id) {
      throw new VoiceProviderError('Vapi did not return a call id.', this.id);
    }
    return { providerCallId: call.id, status: normaliseCallStatus(call.status) };
  }

  async endCall(providerCallId: string): Promise<void> {
    await this.request(`/call/${providerCallId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ended' }),
    });
  }

  async listVoices(): Promise<VoiceOption[]> {
    // Vapi has no unified voice catalogue endpoint; the set depends on which
    // TTS vendor keys are configured. Ship a curated list of stable defaults.
    return [
      { id: 'burt', name: 'Burt', provider: '11labs', language: 'en', gender: 'male' },
      { id: 'rachel', name: 'Rachel', provider: '11labs', language: 'en', gender: 'female' },
      { id: 'sarah', name: 'Sarah', provider: '11labs', language: 'en', gender: 'female' },
      { id: 'alloy', name: 'Alloy', provider: 'openai', language: 'en', gender: 'neutral' },
      { id: 'nova', name: 'Nova', provider: 'openai', language: 'en', gender: 'female' },
    ];
  }

  parseWebhook(payload: any): VoiceWebhookEvent {
    const event = payload?.message;
    if (!event) return { kind: 'ignored' };

    const callLogId: string | undefined =
      event.call?.metadata?.callLogId ?? event.call?.assistantOverrides?.metadata?.callLogId;
    if (!callLogId) return { kind: 'ignored' };

    if (event.type === 'status-update') {
      return { kind: 'status', callLogId, status: normaliseCallStatus(event.status) };
    }

    if (event.type === 'transcript-update' || event.type === 'transcript') {
      return { kind: 'transcript', callLogId, transcript: event.transcript || event.text || '' };
    }

    if (event.type === 'end-of-call-report') {
      const startedAt = event.call?.startedAt;
      const endedAt = event.call?.endedAt;
      const durationSec =
        startedAt && endedAt
          ? Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000))
          : 0;

      const analysis = event.analysis || {};
      const success = String(analysis.successEvaluation ?? 'false').toLowerCase();

      const report: CallEndReport = {
        durationSec,
        endedReason: event.endedReason || 'Completed',
        recordingUrl: event.recordingUrl || null,
        transcriptJson: JSON.stringify(event.transcript || []),
        summary: event.summary || null,
        interested: success === 'true' || success === 'pass',
        customerIntent: analysis.customAnalysis?.intent || null,
        nextAction: analysis.customAnalysis?.nextAction || null,
        objections: analysis.customAnalysis?.objections || null,
      };
      return { kind: 'end-of-call', callLogId, report };
    }

    return { kind: 'ignored', callLogId };
  }
}

/**
 * Flatten structured prompt-builder sections into one system prompt.
 * Shared by adapters that take a single prompt string.
 */
export function buildSystemPrompt(config: VoiceAgentConfig): string {
  const parts: string[] = [];
  if (config.systemPrompt) parts.push(config.systemPrompt.trim());

  for (const section of config.sections || []) {
    if (section.body?.trim()) {
      parts.push(`## ${section.title}\n${section.body.trim()}`);
    }
  }

  return parts.join('\n\n') || 'You are a helpful AI voice assistant.';
}
