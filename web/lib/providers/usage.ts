// Whether the voice engine can still pay for calls, and what it has cost.
//
// There is deliberately no balance here. OmniDimension exposes its balance only
// under /reseller, which answers 403 to an ordinary API key, so the only way to
// show one was to have an admin type it in and count it down — a number that is
// stale the moment somebody tops up, presented as though it were live. That is
// worse than no number at all, so it was removed.
//
// What the API *will* tell us is when the account has run dry: a dispatch comes
// back 402 `insufficient_balance`. That is a fact, it arrives on its own, and it
// is the only thing anybody actually needs to act on. So this module reports
// measured spend, and raises a flag when the engine starts refusing calls.
import { db } from '../db';
import { getProvider } from './index';
import type { ProviderId } from './types';

/** Where the last known credit state is remembered between requests. */
const CREDIT_STATE_KEY = 'provider:omnidimension:credit-state';

/**
 * Record whether the engine could pay for a call.
 *
 * Called from both dial paths. A refusal is captured so the dashboard can say
 * so without anyone reading a call's failure reason; a success clears it, so a
 * top-up resolves the warning by itself rather than leaving a banner somebody
 * has to dismiss.
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
      // about the balance and must not wipe a real warning.
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
  /** Spend per minute of connected time, measured rather than list price. */
  ratePerMinute: number;
  /** True when the engine last refused a call for want of credit. */
  outOfCredits: boolean;
  /** When that refusal happened. */
  outOfCreditsAt: string | null;
  /** Set when the engine could not be asked, so the UI can say why. */
  error: string | null;
}

/**
 * A per-minute rate to fall back on before any call has been made.
 *
 * Taken from the `call_cost_per_min` OmniDimension reports on an agent. Only
 * used to avoid showing a zero on a brand-new account; one real call replaces
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
    outOfCredits: false,
    outOfCreditsAt: null,
    error: null,
  };

  const readUsage = provider.fetchUsage?.bind(provider);
  if (!readUsage) return { ...base, error: `${provider.name} does not report call costs.` };

  let measured;
  try {
    measured = await readUsage();
  } catch (err: any) {
    // A usage panel is not worth a 500 on the settings page.
    return { ...base, error: err?.message ? String(err.message).slice(0, 200) : 'Could not reach the engine.' };
  }

  const creditRow = await db.setting.findUnique({ where: { key: CREDIT_STATE_KEY } }).catch(() => null);
  const credit = creditRow?.value as any;

  return {
    provider: provider.id,
    calls: measured.calls.length,
    talkSeconds: measured.talkSeconds,
    spend: measured.spend,
    ratePerMinute:
      measured.talkSeconds > 0 ? measured.spend / (measured.talkSeconds / 60) : ASSUMED_RATE,
    outOfCredits: !!credit?.outOfCredits,
    outOfCreditsAt: typeof credit?.at === 'string' ? credit.at : null,
    error: null,
  };
}
