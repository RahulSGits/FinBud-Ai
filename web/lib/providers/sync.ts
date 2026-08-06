// Agent <-> provider synchronisation.
//
// The database is the source of truth. Whenever an agent is created or edited,
// we push it to whichever engine will execute its calls and record the result.
// A sync failure never loses the user's edit — it is captured in Agent.syncError
// and surfaced in the UI, so the agent still exists locally and can be retried.
import { db } from '../db';
import { ensureAccountCurrent } from './account';
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

  // Detect a rotated credential before doing anything with a stored id. This
  // clears ids the previous key issued, so the branch below creates rather than
  // fruitlessly updating something the new account has never heard of.
  await ensureAccountCurrent(provider.id);

  try {
    const config = agentToConfig(agent);
    // Re-read: ensureAccountCurrent may have just cleared this agent's id.
    const fresh = await db.agent.findUnique({ where: { id: agentId }, select: { externalAgentId: true } });
    let externalAgentId = fresh?.externalAgentId ?? null;

    if (externalAgentId) {
      try {
        await provider.updateAgent(externalAgentId, config);
      } catch (err: any) {
        // A stored id the provider no longer recognises. The usual cause is a
        // rotated API key: ids are scoped to the account that issued them, so
        // every agent synced under the previous key becomes a 404 the moment
        // the key changes — and, without this, dialling fails permanently with
        // "agent not found" while the agent looks perfectly healthy locally.
        // Re-create it under the current credentials instead.
        // Matched on the response body, not err.status: adapters map upstream
        // codes onto HTTP codes of their own (OmniDimension's 404 arrives as a
        // 502), so the original status is only reliably present in the text.
        const text = `${err?.message ?? ''} ${err?.detail ?? ''}`;
        const orphaned = /\(404\)|not[ _]?found|access denied|does not exist/i.test(text);
        if (!orphaned) throw err;

        console.warn(`[sync] ${agent.name}: external id ${externalAgentId} is unknown to ${provider.name}; re-creating.`);
        externalAgentId = (await provider.createAgent(config)).externalAgentId;
      }
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
