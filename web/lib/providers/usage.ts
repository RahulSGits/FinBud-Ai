// What the voice engine has actually cost, and how much calling is left.
//
// OmniDimension exposes no balance endpoint to an ordinary account — the only
// credit routes are under /reseller and answer 403 unless the key belongs to a
// reseller. So the balance genuinely cannot be read, and anything claiming to
// show it would be inventing a number.
//
// What the API does give is every call's real cost, which is enough to answer
// the question that actually matters — "how much calling do I have left?" —
// provided someone tells us the balance once. Spend and the effective per-minute
// rate are measured; the remaining figure is derived from those and the balance
// the admin recorded, and is labelled as an estimate because it is one.
import { db } from '../db';
import { getProvider } from './index';
import type { ProviderId } from './types';

/** Where the admin records the balance shown on the provider's own dashboard. */
export const BALANCE_KEY = 'provider:omnidimension:balance';

/** Where the last known credit state is remembered between requests. */
const CREDIT_STATE_KEY = 'provider:omnidimension:credit-state';

/**
 * Record whether the engine could pay for a call.
 *
 * The balance itself cannot be read — OmniDimension exposes it only under
 * /reseller, which answers 403 to an ordinary key — but running out is
 * observable: a dispatch comes back 402 `insufficient_balance`. That is the one
 * credit fact the API will tell us, so it is captured wherever a dial is
 * attempted and surfaced on the settings panel without anyone typing anything.
 *
 * Also clears itself. A successful dispatch is proof the account has credit
 * again, so a top-up resolves the warning on the next call rather than leaving
 * a stale "out of credits" banner that has to be dismissed by hand.
 */
export async function noteDispatchOutcome(detail: string | null): Promise<void> {
  const outOfCredits =
    !!detail && /insufficient[_\s]balance|balance is (too )?low|choose appropriate plan/i.test(detail);

  try {
    if (outOfCredits) {
      const value = { outOfCredits: true, at: new Date().toISOString(), detail: detail!.slice(0, 300) };
      await db.setting.upsert({
        where: { key: CREDIT_STATE_KEY },
        create: { key: CREDIT_STATE_KEY, value },
        update: { value },
      });
    } else if (detail === null) {
      // Only a *successful* dispatch clears it. Any other failure says nothing
      // about the balance, so it must not wipe a real warning.
      await db.setting.deleteMany({ where: { key: CREDIT_STATE_KEY } });
    }
  } catch {
    // Billing telemetry must never break a call.
  }
}

export interface ProviderUsage {
  provider: ProviderId;
  /** Calls the engine has a record of, within the window inspected. */
  calls: number;
  /** Total connected time, in seconds. */
  talkSeconds: number;
  /** Total spend across those calls, in the provider's own currency units. */
  spend: number;
  /** Spend per minute of connected time — the number that predicts the future. */
  ratePerMinute: number;
  /** The balance an admin recorded, or null when nobody has. */
  balance: number | null;
  /** Balance minus spend since it was recorded. Null without a balance. */
  remaining: number | null;
  /** Estimated minutes of calling left, from remaining / ratePerMinute. */
  remainingMinutes: number | null;
  /** When the balance was recorded, so a stale one is obvious. */
  balanceRecordedAt: string | null;
  /** True when the engine last refused a call for want of credit. */
  outOfCredits: boolean;
  /** When that refusal happened. */
  outOfCreditsAt: string | null;
  /** Set when the engine could not be asked, so the UI says why. */
  error: string | null;
}

/**
 * A per-minute rate to fall back on before any call has been made.
 *
 * Taken from the `call_cost_per_min` OmniDimension reports on an agent. Only
 * used to avoid dividing by zero on a brand-new account; one real call replaces
 * it with the measured figure.
 */
const ASSUMED_RATE = 0.115;

export async function providerUsage(providerId?: ProviderId): Promise<ProviderUsage> {
  const provider = getProvider(providerId);

  const base: ProviderUsage = {
    provider: provider.id,
    calls: 0,
    talkSeconds: 0,
    spend: 0,
    ratePerMinute: ASSUMED_RATE,
    balance: null,
    remaining: null,
    remainingMinutes: null,
    balanceRecordedAt: null,
    outOfCredits: false,
    outOfCreditsAt: null,
    error: null,
  };

  const readUsage = provider.fetchUsage?.bind(provider);
  if (!readUsage) {
    return { ...base, error: `${provider.name} does not report call costs.` };
  }

  let measured;
  try {
    measured = await readUsage();
  } catch (err: any) {
    // A billing panel is not worth a 500 on the settings page.
    return { ...base, error: err?.message ? String(err.message).slice(0, 200) : 'Could not reach the engine.' };
  }

  const ratePerMinute =
    measured.talkSeconds > 0 ? measured.spend / (measured.talkSeconds / 60) : ASSUMED_RATE;

  const [row, creditRow] = await Promise.all([
    db.setting.findUnique({ where: { key: BALANCE_KEY } }).catch(() => null),
    db.setting.findUnique({ where: { key: CREDIT_STATE_KEY } }).catch(() => null),
  ]);
  const credit = creditRow?.value as any;
  const stored = row?.value as any;
  const balance = Number.isFinite(Number(stored?.amount)) ? Number(stored.amount) : null;
  const recordedAt = typeof stored?.recordedAt === 'string' ? stored.recordedAt : null;

  // Spend is counted from when the balance was recorded, not from the beginning
  // of time — otherwise topping up would still show the account draining.
  const since = recordedAt ? Date.parse(recordedAt) : NaN;
  const spendSince = Number.isFinite(since)
    ? measured.calls
        .filter((c) => c.at != null && c.at >= since)
        .reduce((sum, c) => sum + c.cost, 0)
    : measured.spend;

  const remaining = balance == null ? null : Math.max(0, balance - spendSince);

  return {
    provider: provider.id,
    calls: measured.calls.length,
    talkSeconds: measured.talkSeconds,
    spend: measured.spend,
    ratePerMinute,
    balance,
    remaining,
    remainingMinutes:
      remaining == null || ratePerMinute <= 0 ? null : Math.floor(remaining / ratePerMinute),
    balanceRecordedAt: recordedAt,
    outOfCredits: !!credit?.outOfCredits,
    outOfCreditsAt: typeof credit?.at === 'string' ? credit.at : null,
    error: null,
  };
}
