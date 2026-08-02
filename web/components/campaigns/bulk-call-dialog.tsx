'use client';

// Launch a bulk run over a hand-picked selection of contacts.
//
// The dialog collects the few things a run needs and posts them to
// /api/campaigns/bulk, which builds a real campaign and starts it. Everything
// after that is the campaign runner's job, so the honest thing to show here is
// what the server actually accepted — queued, skipped, ignored — rather than a
// cheerful "done".

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, PhoneCall, PhoneOff, Sparkles, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface BulkCallContact {
  id: string;
  name: string | null;
  phone: string;
  /** ContactStatus. `do_not_call` and `calling` are refused by the server. */
  status: string;
}

export interface BulkCallAgentOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  open: boolean;
  contacts: BulkCallContact[];
  agents: BulkCallAgentOption[];
  onClose: () => void;
  /** Called once, after a successful run, when the dialog is dismissed. */
  onQueued?: () => void;
  /** '/admin' or '/dashboard'. Derived from the current route when omitted. */
  basePath?: string;
}

interface BulkResult {
  campaignId: string;
  campaignName: string;
  /** Everything the user had selected, including what was never sent. */
  selected: number;
  queued: number;
  skippedDoNotCall: number;
  skippedInProgress: number;
  notEligible: number;
  movedFromOtherCampaigns: number;
  dialled: number;
  mock: boolean;
  notice: string | null;
}

/** Mon–Sat, matching the campaign builder's default calling week. */
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];
const DEFAULT_TZ = 'Asia/Kolkata';

const INPUT =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

// Without an explicit colour-scheme the browser draws its native clock glyph in
// dark ink, which vanishes against the dark input.
const TIME_INPUT = `${INPUT} dark:[color-scheme:dark]`;

const SECONDARY =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50';

function reason(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function BulkCallDialog({
  open, contacts, agents, onClose, onQueued, basePath,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const base = basePath ?? (pathname?.startsWith('/dashboard') ? '/dashboard' : '/admin');

  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [concurrency, setConcurrency] = useState('3');
  const [limitHours, setLimitHours] = useState(true);
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('20:00');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BulkResult | null>(null);

  const active = useMemo(() => agents.filter((a) => a.isActive), [agents]);

  const split = useMemo(() => {
    const blocked = contacts.filter((c) => c.status === 'do_not_call');
    const inProgress = contacts.filter((c) => c.status === 'calling');
    const dialable = contacts.filter((c) => c.status !== 'do_not_call' && c.status !== 'calling');
    return { blocked, inProgress, dialable };
  }, [contacts]);

  // Reset the draft each time the dialog is opened. Deliberately keyed on
  // `open` alone: the selection is fixed at that moment, and re-running this
  // when the parent's rows refresh would wipe what the user has typed.
  useEffect(() => {
    if (!open) return;
    const dialable = contacts.filter((c) => c.status !== 'do_not_call' && c.status !== 'calling');
    setName(`Bulk call — ${plural(dialable.length, 'lead', 'leads')}`);
    setAgentId(agents.find((a) => a.isActive)?.id ?? '');
    setConcurrency('3');
    setLimitHours(true);
    setStart('09:00');
    setEnd('20:00');
    setBusy(false);
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function close() {
    if (busy) return;
    // The selection has been consumed only if a run actually started.
    if (result) onQueued?.();
    onClose();
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    if (!agentId) {
      toast.error('Pick an agent to run these calls.');
      return;
    }
    if (split.dialable.length === 0) {
      toast.error('Nothing in this selection can be dialled.');
      return;
    }
    if (limitHours && (!start || !end)) {
      toast.error('Set the start and end of the calling window.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/campaigns/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactIds: split.dialable.map((c) => c.id),
          agentId,
          name: name.trim() || undefined,
          concurrency: Number(concurrency) || 3,
          businessHours: limitHours
            ? { tz: DEFAULT_TZ, days: DEFAULT_DAYS, start, end }
            : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(text(data.error) ?? 'Could not start the bulk run.');

      const report: BulkResult = {
        campaignId: String(data.campaignId ?? ''),
        campaignName: text(data.campaignName) ?? name.trim(),
        selected: contacts.length,
        queued: num(data.queued),
        skippedDoNotCall: num(data.skippedDoNotCall) + split.blocked.length,
        skippedInProgress: num(data.skippedInProgress) + split.inProgress.length,
        notEligible: num(data.notEligible),
        movedFromOtherCampaigns: num(data.movedFromOtherCampaigns),
        dialled: num(data.dialled),
        mock: data.mock === true,
        notice: text(data.notice),
      };
      setResult(report);

      if (report.notice) toast.warning(report.notice);
      else {
        toast.success(
          `${plural(report.queued, 'lead', 'leads')} queued${report.dialled > 0 ? `, ${report.dialled} dialling now` : ''}${report.mock ? ' (simulated)' : ''}`
        );
      }
      router.refresh();
    } catch (err) {
      toast.error(reason(err));
    } finally {
      // Always released, whichever branch ran — a stuck spinner is worse than
      // an error the user can read.
      setBusy(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10"
          >
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {result ? 'Bulk run started' : 'Call selected contacts'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {result
                    ? result.campaignName
                    : `${plural(split.dialable.length, 'lead', 'leads')} ready to dial out of ${contacts.length} selected`}
                </p>
              </div>
              <button
                onClick={close}
                disabled={busy}
                aria-label="Close"
                className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {result ? (
              <div className="px-6 pb-6 space-y-4">
                <div className="flex items-start gap-3 rounded-xl bg-brand-100 dark:bg-brand-500/10 px-4 py-3.5">
                  <CheckCircle2 className="w-5 h-5 text-brand-700 dark:text-brand-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-brand-800 dark:text-brand-300">
                      {plural(result.queued, 'lead', 'leads')} queued
                      {result.mock && ' (simulated — no real number is dialled)'}
                    </p>
                    <p className="text-xs text-brand-700/80 dark:text-brand-300/80 mt-0.5">
                      {result.dialled > 0
                        ? `${plural(result.dialled, 'call is', 'calls are')} dialling now. The rest follow as lines free up.`
                        : 'The campaign runner picks them up on its next pass.'}
                    </p>
                  </div>
                </div>

                {/* Everything the server did not queue, said out loud —
                    a silent drop is indistinguishable from a bug. */}
                <dl className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06] px-4">
                  <Line label="Selected" value={result.selected} />
                  <Line label="Queued to call" value={result.queued} tone="good" />
                  {result.skippedDoNotCall > 0 && (
                    <Line label="Skipped — do not call" value={result.skippedDoNotCall} tone="warn" />
                  )}
                  {result.skippedInProgress > 0 && (
                    <Line label="Skipped — already on a call" value={result.skippedInProgress} tone="warn" />
                  )}
                  {result.notEligible > 0 && (
                    <Line label="Not eligible for you" value={result.notEligible} tone="warn" />
                  )}
                  {result.movedFromOtherCampaigns > 0 && (
                    <Line label="Moved from another campaign" value={result.movedFromOtherCampaigns} />
                  )}
                </dl>

                {result.notice && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">{result.notice}</p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={close} className={SECONDARY}>
                    Close
                  </button>
                  {result.campaignId && (
                    <Link
                      href={`${base}/campaigns/${result.campaignId}`}
                      onClick={close}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
                    >
                      Open campaign <ArrowRight className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="px-6 pb-6 space-y-4">
                {(split.blocked.length > 0 || split.inProgress.length > 0) && (
                  <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
                    <PhoneOff className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
                      {[
                        split.blocked.length > 0
                          ? `${plural(split.blocked.length, 'contact is', 'contacts are')} marked do-not-call`
                          : '',
                        split.inProgress.length > 0
                          ? `${plural(split.inProgress.length, 'contact is', 'contacts are')} already on a call`
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' and ')}{' '}
                      — they stay out of this run.
                    </p>
                  </div>
                )}

                <Field label="Campaign name" hint="This run shows up in Campaigns under this name.">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bulk call"
                    maxLength={120}
                    className={INPUT}
                  />
                </Field>

                {/* Not wrapped in Field: with no active agent this slot holds a
                    link rather than a control, and a <label> around it would
                    steal the click. */}
                <div>
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Agent
                  </span>
                  {active.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 px-4 py-5 text-center">
                      <Sparkles className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        No active agent to call with
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 mb-3">
                        An agent runs the conversation. Create one and switch it on first.
                      </p>
                      <Link
                        href={`${base}/agents/new`}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
                      >
                        Create an agent <ArrowRight className="w-4 h-4" />
                      </Link>
                    </div>
                  ) : (
                    <select
                      value={agentId}
                      onChange={(e) => setAgentId(e.target.value)}
                      aria-label="Agent for this bulk run"
                      className={INPUT}
                    >
                      <option value="">Choose an agent…</option>
                      {active.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                <Field label="Calls at once" hint="How many lines run in parallel. The rest wait their turn.">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={concurrency}
                    onChange={(e) => setConcurrency(e.target.value)}
                    className={INPUT}
                  />
                </Field>

                <div className="rounded-xl border border-slate-200 dark:border-white/10 px-4 py-3.5 space-y-3">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={limitHours}
                      onChange={(e) => setLimitHours(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded accent-brand-600"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                        Only call during business hours
                      </span>
                      <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                        Monday to Saturday, {DEFAULT_TZ}. Outside the window the run{' '}
                        <strong className="font-semibold">waits rather than failing</strong> — it stays
                        queued and starts dialling by itself once the window opens.
                      </span>
                    </span>
                  </label>

                  {limitHours && (
                    <div className="grid grid-cols-2 gap-3 pl-[1.625rem]">
                      <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                          <Clock className="w-3 h-3" /> From
                        </span>
                        <input type="time" value={start} onChange={(e) => setStart(e.target.value)} className={TIME_INPUT} />
                      </label>
                      <label className="block">
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                          <Clock className="w-3 h-3" /> Until
                        </span>
                        <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={TIME_INPUT} />
                      </label>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Selected leads are attached to this campaign, so any that already belong to another
                  one move across. Calls, transcripts and outcomes land in the call log as usual.
                </p>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button type="button" onClick={close} disabled={busy} className={SECONDARY}>
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={busy || active.length === 0 || split.dialable.length === 0}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                    {busy ? 'Starting…' : `Start calling ${split.dialable.length}`}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">{hint}</span>}
    </label>
  );
}

function Line({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone?: 'good' | 'warn';
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={cn(
          'text-xs font-semibold tabular-nums',
          tone === 'good' && 'text-brand-700 dark:text-brand-400',
          tone === 'warn' && 'text-amber-700 dark:text-amber-400',
          !tone && 'text-slate-800 dark:text-slate-200'
        )}
      >
        {value}
      </dd>
    </div>
  );
}
