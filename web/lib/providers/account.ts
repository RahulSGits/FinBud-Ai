// Detecting that the provider account changed underneath us.
//
// Provider-side ids are scoped to the credential that created them. Rotate an
// API key and every id we stored — agent ids, call ids, message ids — silently
// becomes a 404 belonging to an account we can no longer see. Nothing about the
// local row looks wrong, so the failure surfaces much later as "agent not
// found" on a dial, which reads as a bug in this app rather than a
// consequence of changing a key.
//
// So the app fingerprints the credential it is currently holding, remembers it,
// and when it changes, drops the ids that can no longer be valid. Everything
// re-syncs on next use.
import { createHash } from 'crypto';
import { db } from '../db';
import type { ProviderId } from './types';

/**
 * A stable, non-reversible identifier for the credential in use.
 *
 * The key itself is never stored — a rotated key is usually rotated *because*
 * the old one leaked, and writing it into a Setting row would put it somewhere
 * nobody thinks to clean. A truncated SHA-256 is enough to answer the only
 * question being asked: "is this the same credential as last time?"
 */
function fingerprint(secret: string): string {
  return createHash('sha256').update(secret).digest('hex').slice(0, 16);
}

/** Which environment variable holds each provider's credential. */
function credentialFor(provider: ProviderId): string | null {
  switch (provider) {
    case 'omnidimension':
      return process.env.OMNIDIM_API_KEY || null;
    case 'livekit':
      // The secret, not the key: rotating either invalidates the pair, and the
      // secret is the half that actually changes on a rotation.
      return process.env.LIVEKIT_API_SECRET || null;
    case 'mock':
      return null; // nothing upstream to go stale
    default:
      return null;
  }
}

const settingKey = (provider: ProviderId) => `provider:${provider}:account`;

export interface AccountCheck {
  /** True when the credential differs from the one seen last time. */
  rotated: boolean;
  /** Agents whose provider-side id was dropped as a result. */
  clearedAgents: number;
}

/**
 * Reconcile stored provider-side state with the credential in use.
 *
 * Safe and cheap to call before any provider operation: one Setting read in the
 * common case. Idempotent — once the new fingerprint is recorded, later calls
 * are a no-op.
 */
export async function ensureAccountCurrent(provider: ProviderId): Promise<AccountCheck> {
  const secret = credentialFor(provider);
  if (!secret) return { rotated: false, clearedAgents: 0 };

  const current = fingerprint(secret);
  const key = settingKey(provider);

  const row = await db.setting.findUnique({ where: { key } });
  const previous = typeof row?.value === 'string' ? row.value : null;

  if (previous === current) return { rotated: false, clearedAgents: 0 };

  // First run against a fresh database: record the fingerprint, but do NOT
  // treat it as a rotation. Clearing ids here would throw away perfectly good
  // sync state simply because this deployment had never looked before.
  if (previous === null) {
    await db.setting.upsert({ where: { key }, create: { key, value: current }, update: { value: current } });
    return { rotated: false, clearedAgents: 0 };
  }

  // A genuine rotation. Every provider-side id issued by the old credential is
  // unusable, so drop them and let the normal sync path re-create them. The
  // agents themselves — prompts, voice, settings — are untouched.
  const cleared = await db.agent.updateMany({
    where: { voiceProvider: provider, externalAgentId: { not: null } },
    data: {
      externalAgentId: null,
      syncedAt: null,
      syncError: 'The provider API key changed, so this agent is being republished.',
    },
  });

  await db.setting.upsert({ where: { key }, create: { key, value: current }, update: { value: current } });

  await db.auditLog
    .create({
      data: {
        action: 'provider.key_rotated',
        entity: 'Provider',
        entityId: provider,
        meta: { clearedAgents: cleared.count },
      },
    })
    .catch(() => undefined);

  console.warn(
    `[provider] ${provider}: credential changed; cleared ${cleared.count} stale agent id(s) for republishing.`
  );

  return { rotated: true, clearedAgents: cleared.count };
}
