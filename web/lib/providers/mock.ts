// Mock provider — active when USE_MOCK_CALLS=true.
//
// Wraps the existing local call simulator so the whole product (agent builder,
// campaigns, dashboards, analytics) runs end to end with zero external spend.
import {
  AgentConfig, LanguageOption, ModelOption, PhoneNumberOption, ProviderCapabilities,
  StartCallParams, StartCallResult, VoiceEvent, VoiceOption, VoiceProvider, normaliseStatus,
} from './types';

export class MockProvider implements VoiceProvider {
  readonly id = 'mock' as const;
  readonly name = 'Mock (no external calls)';

  async isConfigured(): Promise<boolean> {
    return true;
  }

  capabilities(): ProviderCapabilities {
    return { serverAgents: false, knowledgeBase: true, phoneNumbers: true, voiceCatalogue: true, webhooks: false };
  }

  async createAgent(config: AgentConfig): Promise<{ externalAgentId: string }> {
    return { externalAgentId: `mock_agent_${Date.now()}` };
  }
  async updateAgent(): Promise<void> {}
  async deleteAgent(): Promise<void> {}

  async startCall(params: StartCallParams): Promise<StartCallResult> {
    const { mockDispatch } = await import('../livekit/mock');
    const callId = String(params.metadata.callLogId ?? params.metadata.callId ?? '');
    const r = await mockDispatch({
      to: params.to,
      callId,
      agentId: String(params.metadata.agentId ?? ''),
      contactId: (params.metadata.contactId as string) ?? null,
      campaignId: (params.metadata.campaignId as string) ?? null,
      customerName: (params.metadata.customerName as string) ?? null,
    });
    return { providerCallId: r.roomName, status: normaliseStatus(r.status) };
  }

  async endCall(): Promise<void> {}

  async listVoices(): Promise<VoiceOption[]> {
    return [
      { id: 'priya', name: 'Priya (Hindi)', provider: 'mock', language: 'hi', gender: 'female' },
      { id: 'arjun', name: 'Arjun (Hindi)', provider: 'mock', language: 'hi', gender: 'male' },
      { id: 'rachel', name: 'Rachel (English)', provider: 'mock', language: 'en', gender: 'female' },
      { id: 'burt', name: 'Burt (English)', provider: 'mock', language: 'en', gender: 'male' },
    ];
  }

  async listModels(): Promise<ModelOption[]> {
    return [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', kind: 'llm' },
      { id: 'openai/gpt-4o', name: 'GPT-4o', kind: 'llm' },
      { id: 'deepgram/nova-3', name: 'Deepgram Nova-3', kind: 'stt' },
      { id: 'cartesia/sonic-3', name: 'Cartesia Sonic-3', kind: 'tts' },
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
    return [{ id: 'mock-1', number: '+91 90000 00000', label: 'Demo number', country: 'IN' }];
  }

  parseWebhook(payload: any): VoiceEvent {
    const callId = payload?.callId ?? payload?.callLogId;
    if (!callId) return { kind: 'ignored' };
    return { kind: 'status', callId, status: normaliseStatus(payload.status || 'completed') };
  }

  // `fetchCallResult` is deliberately not implemented. The simulator writes its
  // results straight to the database, so there is no remote truth to reconcile
  // against — and in mock mode every agent resolves here, which is exactly what
  // keeps the reconciler from making network calls during local development.
}
