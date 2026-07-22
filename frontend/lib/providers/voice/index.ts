// Voice provider registry + resolver.
//
// This is the ONLY module application code should import to reach a voice
// provider. Adding Retell/Bland later means writing an adapter and adding one
// line to REGISTRY — no route, UI or schema changes.
import { MockVoiceProvider } from './mock';
import { OmniDimensionProvider } from './omnidimension';
import { VapiProvider } from './vapi';
import { VoiceAgentConfig, VoiceProvider, VoiceProviderId } from './types';

export * from './types';
export { applyVoiceEvent } from './events';

const REGISTRY: Record<VoiceProviderId, VoiceProvider> = {
  vapi: new VapiProvider(),
  omnidimension: new OmniDimensionProvider(),
  mock: new MockVoiceProvider(),
};

/** True when the app should avoid every paid external call. */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_DATA === 'true';
}

/**
 * Resolve the provider for an agent. In mock mode every agent resolves to the
 * mock adapter, which is what makes key-free local development possible.
 */
export function getVoiceProvider(providerId?: string | null): VoiceProvider {
  if (isMockMode()) return REGISTRY.mock;
  const id = (providerId || 'vapi').toLowerCase() as VoiceProviderId;
  return REGISTRY[id] ?? REGISTRY.vapi;
}

/** Providers offered in the agent builder, with live configuration status. */
export async function listVoiceProviders(): Promise<
  { id: VoiceProviderId; name: string; configured: boolean }[]
> {
  const ids: VoiceProviderId[] = ['vapi', 'omnidimension'];
  const mock = isMockMode();

  const entries = await Promise.all(
    ids.map(async (id) => ({
      id,
      name: REGISTRY[id].name,
      // Everything is usable in mock mode regardless of real credentials.
      configured: mock || (await REGISTRY[id].isConfigured()),
    }))
  );

  return mock
    ? [{ id: 'mock' as VoiceProviderId, name: REGISTRY.mock.name, configured: true }, ...entries]
    : entries;
}

/** Absolute webhook URL a provider should call back on. */
export function webhookUrlFor(providerId: string): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/api/webhooks/${providerId}`;
}

/** Shape a Prisma Agent row (plus its active prompt) into a neutral config. */
export function agentToConfig(agent: any, prompt?: any): VoiceAgentConfig {
  const p = prompt ?? agent?.prompts?.[0];

  const sections = p
    ? [
        { title: 'Business Context', body: p.businessContext || '' },
        { title: 'Call Objective', body: p.callObjective || '' },
        { title: 'Qualification Rules', body: p.qualificationRules || '' },
        { title: 'Objection Handling', body: p.fallbackRules || '' },
        { title: 'Compliance', body: p.complianceRules || '' },
        { title: 'Closing Script', body: p.closingInstructions || '' },
      ].filter((s) => s.body.trim())
    : [];

  return {
    name: agent.name,
    description: agent.description,
    firstMessage: agent.firstMessage,
    systemPrompt: p?.systemPrompt || agent.systemPrompt,
    sections,
    llmProvider: agent.llmProvider,
    model: agent.model,
    temperature: agent.temperature,
    maxTokens: agent.maxTokens,
    voiceProvider: agent.voiceProvider,
    voiceId: agent.voiceId,
    language: agent.language,
    sttProvider: agent.sttProvider,
    sttModel: agent.sttModel,
    silenceTimeout: agent.silenceTimeout,
    interruptions: agent.interruptions,
    transferEnabled: agent.transferEnabled,
    transferNumber: agent.transferNumber,
    serverUrl: webhookUrlFor(agent.provider || 'vapi'),
  };
}
