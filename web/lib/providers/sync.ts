// Agent <-> provider synchronisation.
//
// The database is the source of truth. Whenever an agent is created or edited,
// we push it to whichever engine will execute its calls and record the result.
// A sync failure never loses the user's edit — it is captured in Agent.syncError
// and surfaced in the UI, so the agent still exists locally and can be retried.
import { db } from '../db';
import { agentToConfig, getProvider, isMockMode } from './index';

export interface SyncResult {
  synced: boolean;
  externalAgentId?: string | null;
  error?: string | null;
}

/** Push an agent to its provider, creating or updating as needed. */
export async function syncAgent(agentId: string): Promise<SyncResult> {
  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { synced: false, error: 'Agent not found' };

  const provider = getProvider(agent.voiceProvider);

  // Providers without a server-side agent resource (LiveKit, mock) have nothing
  // to push — the config travels with each call. Record success cleanly.
  if (!provider.capabilities().serverAgents || isMockMode()) {
    await db.agent.update({
      where: { id: agentId },
      data: { syncedAt: new Date(), syncError: null },
    });
    return { synced: true, externalAgentId: agent.externalAgentId };
  }

  if (!(await provider.isConfigured())) {
    const error = `${provider.name} is not configured; agent saved but not synced.`;
    await db.agent.update({ where: { id: agentId }, data: { syncError: error } });
    return { synced: false, error };
  }

  try {
    const config = agentToConfig(agent);
    let externalAgentId = agent.externalAgentId;

    if (externalAgentId) {
      await provider.updateAgent(externalAgentId, config);
    } else {
      externalAgentId = (await provider.createAgent(config)).externalAgentId;
    }

    await db.agent.update({
      where: { id: agentId },
      data: { externalAgentId, syncedAt: new Date(), syncError: null },
    });
    return { synced: true, externalAgentId };
  } catch (err: any) {
    const error = [err?.message, err?.detail].filter(Boolean).join(' — ').slice(0, 400) || 'Sync failed';
    await db.agent.update({ where: { id: agentId }, data: { syncError: error } });
    return { synced: false, error };
  }
}

/** Best-effort removal from the provider before local deletion. */
export async function unsyncAgent(agent: { voiceProvider: string; externalAgentId: string | null }): Promise<void> {
  const provider = getProvider(agent.voiceProvider);
  if (!provider.capabilities().serverAgents || !agent.externalAgentId || isMockMode()) return;
  try {
    if (await provider.isConfigured()) await provider.deleteAgent(agent.externalAgentId);
  } catch (err) {
    console.error('Failed to delete provider agent:', err);
  }
}
