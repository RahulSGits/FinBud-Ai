'use client';

// What calling has cost, and a warning when the engine stops accepting calls.
//
// This used to be a billing panel: a balance typed in by hand, counted down
// into "time left" and "credits left". OmniDimension exposes no balance to an
// ordinary API key, so those figures were only ever as fresh as the last person
// to update them — a stale number presented as a live one, which is worse than
// no number. It is gone.
//
// What is left is measured: spend and the real per-minute rate, both from the
// engine's own per-call charges. And the one thing that genuinely needs acting
// on — the account refusing calls for want of credit — which arrives on its own
// from a 402 on dispatch and clears itself when a call next succeeds.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCw, Wallet } from 'lucide-react';

interface Usage {
  calls: number;
  talkSeconds: number;
  spend: number;
  ratePerMinute: number;
  outOfCredits: boolean;
  outOfCreditsAt: string | null;
  error: string | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

export function UsageCard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch('/api/providers/usage');
      if (res.ok) setUsage(await res.json());
    } catch {
      // Leave the last good reading rather than blanking the card.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();

    // Spend only moves when a call ends, so a minute is frequent enough to feel
    // current — and it means the out-of-credit warning appears while the page
    // is open rather than waiting for somebody to press Refresh.
    const timer = setInterval(() => void load(false), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  const card =
    'rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5';

  if (loading) {
    return (
      <div className={`${card} flex items-center gap-2.5`} role="status" aria-label="Loading usage">
        <Loader2 className="w-4 h-4 motion-safe:animate-spin text-slate-400" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Reading call costs from the engine…</p>
      </div>
    );
  }

  if (!usage) return null;

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Calling usage</h3>
        </div>
        <button
          type="button"
          onClick={() => void load(false)}
          className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* The only thing here that needs acting on. Detected from a real refused
          dispatch, not typed in, and it clears itself once a call connects. */}
      {usage.outOfCredits && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Out of credits — calls are being refused
            </p>
            <p className="text-xs text-red-600/90 dark:text-red-400/80 mt-0.5 leading-relaxed">
              The voice engine turned down a call for want of balance
              {usage.outOfCreditsAt ? ` on ${new Date(usage.outOfCreditsAt).toLocaleString()}` : ''}.
              Top up on the provider&apos;s dashboard — this clears itself once a call connects again.
            </p>
          </div>
        </div>
      )}

      {usage.error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">{usage.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Calls" value={String(usage.calls)} />
            <Stat label="Spent" value={money(usage.spend)} />
            <Stat label="Talk time" value={clock(usage.talkSeconds)} />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
            {money(usage.ratePerMinute)}/min, measured from actual charges. The provider&apos;s API
            does not report a balance — check it on their dashboard.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-semibold text-slate-900 dark:text-white tabular-nums">{value}</p>
    </div>
  );
}
