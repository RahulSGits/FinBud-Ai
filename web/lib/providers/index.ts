// Voice provider registry + resolver.
//
// The ONLY module the application imports to reach a voice engine. Adding a
// provider (e.g. a custom OpenAI + Sarvam + Deepgram + Exotel stack) means
// writing one adapter and adding a line here — no route, dashboard, schema or
// workflow changes.
import { LiveKitProvider } from './livekit';
import { MockProvider } from './mock';
import { OmniDimensionProvider } from './omnidimension';
import { AgentConfig, ProviderId, VoiceProvider } from './types';

export * from './types';

const REGISTRY: Record<ProviderId, VoiceProvider> = {
  omnidimension: new OmniDimensionProvider(),
  livekit: new LiveKitProvider(),
  mock: new MockProvider(),
};

/** True when the app should avoid every paid external call. */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_CALLS === 'true';
}

/**
 * The platform-wide default engine, from PROVIDER (env) or the DB setting.
 * Falls back to livekit. Mock mode overrides everything.
 */
export function defaultProviderId(): ProviderId {
  if (isMockMode()) return 'mock';
  const p = (process.env.VOICE_PROVIDER || 'livekit').toLowerCase() as ProviderId;
  return p in REGISTRY ? p : 'livekit';
}

/**
 * Resolve the provider for an agent. In mock mode every agent resolves to the
 * mock adapter — this is what makes key-free local development possible.
 */
export function getProvider(providerId?: string | null): VoiceProvider {
  if (isMockMode()) return REGISTRY.mock;
  const id = (providerId || defaultProviderId()).toLowerCase() as ProviderId;
  return REGISTRY[id] ?? REGISTRY[defaultProviderId()];
}

/** Providers offered in Settings, with live configuration status. */
export async function listProviders(): Promise<
  { id: ProviderId; name: string; configured: boolean; capabilities: ReturnType<VoiceProvider['capabilities']> }[]
> {
  const ids: ProviderId[] = ['omnidimension', 'livekit'];
  const mock = isMockMode();
  const out = await Promise.all(
    ids.map(async (id) => ({
      id,
      name: REGISTRY[id].name,
      configured: mock || (await REGISTRY[id].isConfigured()),
      capabilities: REGISTRY[id].capabilities(),
    }))
  );
  return mock
    ? [{ id: 'mock' as ProviderId, name: REGISTRY.mock.name, configured: true, capabilities: REGISTRY.mock.capabilities() }, ...out]
    : out;
}

/** Absolute webhook URL a provider should call back on. */
export function webhookUrlFor(providerId: string): string | null {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, '')}/api/webhooks/${providerId}` : null;
}

/** Shape a Prisma Agent row into a provider-neutral config. */
export function agentToConfig(agent: any): AgentConfig {
  const sections = [
    { title: 'Business context', body: agent.businessContext ?? '' },
    { title: 'Call objective', body: agent.callObjective ?? '' },
    { title: 'Qualification rules', body: agent.qualificationRules ?? '' },
    { title: 'Objection handling', body: agent.objectionHandling ?? '' },
    { title: 'Compliance', body: agent.complianceRules ?? '' },
    { title: 'Closing', body: agent.closingScript ?? '' },
  ].filter((s) => s.body.trim());

  return {
    name: agent.name,
    description: agent.description,
    firstMessage: agent.firstMessage,
    systemPrompt: agent.systemPrompt,
    sections,
    llmModel: agent.llmModel,
    sttModel: agent.sttModel,
    ttsModel: agent.ttsModel,
    voiceId: agent.voiceId,
    language: agent.language,
    transferEnabled: agent.transferEnabled,
    transferNumber: agent.transferNumber,
    webhookUrl: webhookUrlFor(agent.voiceProvider || defaultProviderId()),
  };
}
