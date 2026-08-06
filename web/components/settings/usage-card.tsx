'use client';

// Voice-engine spend, and how much calling is left.
//
// The balance is typed in rather than fetched because OmniDimension exposes no
// balance endpoint to an ordinary API key — its only credit routes are under
// /reseller and answer 403. Everything else here is measured from the engine's
// own per-call costs, so the panel is honest about which numbers are observed
// and which one is an estimate resting on what somebody typed.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Wallet } from 'lucide-react';
import { toast } from 'sonner';

interface Usage {
  provider: string;
  calls: number;
  talkSeconds: number;
  spend: number;
  ratePerMinute: number;
  balance: number | null;
  remaining: number | null;
  remainingMinutes: number | null;
  balanceRecordedAt: string | null;
  error: string | null;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/** "about 4 hours" reads better than "247 minutes" for a runway figure. */
function runway(minutes: number): string {
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `about ${h}h ${m}m` : `about ${h}h`;
}

export function UsageCard() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch('/api/providers/usage');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not read usage.');
      setUsage(data);
      setDraft(data.balance == null ? '' : String(data.balance));
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not read usage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveBalance(amount: string | null) {
    setSaving(true);
    try {
      const res = await fetch('/api/providers/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not save.');
      setUsage(data);
      toast.success(amount === null ? 'Balance cleared.' : 'Balance recorded.');
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  const card =
    'rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5';

  if (loading) {
    return (
      <div className={`${card} flex items-center gap-2.5`}>
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
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
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Credits &amp; call time</h3>
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

      {usage.error ? (
        <p className="text-xs text-amber-600 dark:text-amber-400">{usage.error}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Time left" value={usage.remainingMinutes == null ? '—' : runway(usage.remainingMinutes)} accent />
            <Stat label="Credits left" value={usage.remaining == null ? '—' : money(usage.remaining)} accent />
            <Stat label="Spent" value={money(usage.spend)} />
            <Stat label="Talk time" value={clock(usage.talkSeconds)} />
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            {usage.calls} call{usage.calls === 1 ? '' : 's'} at{' '}
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {money(usage.ratePerMinute)}/min
            </span>{' '}
            measured from actual charges.
            {usage.balanceRecordedAt
              ? ` Counting down from the balance you recorded on ${new Date(
                  usage.balanceRecordedAt
                ).toLocaleDateString()}.`
              : ''}
          </p>

          {/* Typed in, not fetched — and the panel says so, because a number
              presented as live when it is a week-old memory is worse than an
              empty box. */}
          <div className="rounded-xl bg-slate-50 dark:bg-white/5 p-3.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Balance from your OmniDimension dashboard
            </label>
            <div className="flex items-center gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 25.00"
                className="h-9 flex-1 min-w-0 px-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-sm text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={() => void saveBalance(draft.trim() || null)}
                disabled={saving}
                className="h-9 px-3.5 rounded-lg bg-brand-600 text-white text-xs font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
              </button>
              {usage.balance != null && (
                <button
                  type="button"
                  onClick={() => void saveBalance(null)}
                  disabled={saving}
                  className="h-9 px-2.5 rounded-lg text-xs font-medium text-slate-500 hover:bg-white dark:hover:bg-white/5 disabled:opacity-50"
                >
                  Clear
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              OmniDimension&apos;s API does not expose a balance, so it is entered here once and
              counted down from real call charges. Re-enter it after a top-up.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p
        className={
          accent
            ? 'text-lg font-semibold text-brand-600 dark:text-brand-400 tabular-nums'
            : 'text-lg font-semibold text-slate-900 dark:text-white tabular-nums'
        }
      >
        {value}
      </p>
    </div>
  );
}
