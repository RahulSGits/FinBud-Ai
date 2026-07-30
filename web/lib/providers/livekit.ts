// LiveKit adapter.
//
// Wraps the existing LiveKit dispatch layer (agent dispatch + SIP participant).
// LiveKit has no server-side "agent" resource — agent config lives in our DB
// and is passed to the worker via room metadata at dial time — so createAgent
// here is a no-op that simply returns our own id as the external id.
import {
  AgentConfig, LanguageOption, ModelOption, PhoneNumberOption, ProviderCapabilities,
  ProviderError, StartCallParams, StartCallResult, VoiceEvent, VoiceOption, VoiceProvider,
  normaliseStatus,
} from './types';

export class LiveKitProvider implements VoiceProvider {
  readonly id = 'livekit' as const;
  readonly name = 'LiveKit';

  async isConfigured(): Promise<boolean> {
    const { isDispatchConfigured } = await import('../livekit/dispatch');
    return isDispatchConfigured().ok;
  }

  capabilities(): ProviderCapabilities {
    // No server-side agent resource, no vendor voice catalogue: config and the
    // model/voice lists are owned by us, not LiveKit.
    return { serverAgents: false, knowledgeBase: false, phoneNumbers: false, voiceCatalogue: false, webhooks: true };
  }

  // LiveKit agents are defined in our worker + DB, not on LiveKit's side.
  async createAgent(): Promise<{ externalAgentId: string }> {
    return { externalAgentId: '' };
  }
  async updateAgent(): Promise<void> {}
  async deleteAgent(): Promise<void> {}

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    const { dispatchCall } = await import('../livekit/dispatch');
    const callId = String(params.metadata.callLogId ?? params.metadata.callId ?? '');
    const r = await dispatchCall({
      to: params.to,
      callId,
      agentId: String(params.metadata.agentId ?? ''),
      contactId: (params.metadata.contactId as string) ?? null,
      campaignId: (params.metadata.campaignId as string) ?? null,
      customerName: (params.metadata.customerName as string) ?? null,
    });
    return { providerCallId: r.roomName, status: normaliseStatus(r.status) };
  }

  async endCall(providerCallId: string): Promise<void> {
    const { endCall } = await import('../livekit/dispatch');
    await endCall(providerCallId);
  }

  // Models and voices route through LiveKit Inference — the app owns the list.
  async listVoices(): Promise<VoiceOption[]> {
    return [
      { id: '9626c31c-bec5-4cca-baa8-f8ba9e84c8bc', name: 'Sonic — Natural', provider: 'cartesia', language: 'en' },
      { id: 'sarvam-meera', name: 'Meera (Hindi)', provider: 'sarvam', language: 'hi', gender: 'female' },
    ];
  }
  async listModels(): Promise<ModelOption[]> {
    return [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', kind: 'llm' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', kind: 'llm' },
      { id: 'google/gemini-2.0-flash', name: 'Gemini 2.0 Flash', kind: 'llm' },
      { id: 'deepgram/nova-3', name: 'Deepgram Nova-3', kind: 'stt' },
      { id: 'cartesia/sonic-3', name: 'Cartesia Sonic-3', kind: 'tts' },
      { id: 'elevenlabs/eleven_turbo_v2_5', name: 'ElevenLabs Turbo', kind: 'tts' },
    ];
  }
  async listLanguages(): Promise<LanguageOption[]> {
    return [
      { code: 'multi', name: 'Multilingual (auto)' },
      { code: 'en', name: 'English' },
      { code: 'hi', name: 'Hindi' },
    ];
  }
  async listPhoneNumbers(): Promise<PhoneNumberOption[]> {
    const id = process.env.LIVEKIT_SIP_TRUNK_ID;
    return id ? [{ id, number: 'SIP trunk', label: 'Configured trunk' }] : [];
  }

  parseWebhook(payload: any): VoiceEvent {
    // The worker posts normalised reports to /api/internal/call-report, so the
    // LiveKit provider's webhook parser only handles simple status pings.
    const callId = payload?.callId ?? payload?.callLogId;
    if (!callId) return { kind: 'ignored' };
    return { kind: 'status', callId, status: normaliseStatus(payload.status) };
  }
}
