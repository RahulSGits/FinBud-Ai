'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PhoneCall, Search, Sparkles, X, FileText, Clock, Loader2, MessageCircle, Download,
  AlertTriangle, ArrowRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { ExportButton } from '@/components/export/export-button';
import {
  SendMessageDialog,
  type MessageRecipient,
  type SendMessageTarget,
} from '@/components/messaging/send-message-dialog';
import { cn } from '@/lib/utils';

export interface CallRow {
  id: string;
  phone: string;
  contactName: string | null;
  agentName: string | null;
  campaignName: string | null;
  status: string;
  leadStatus: string;
  durationSec: number;
  summary: string | null;
  transcriptText: string | null;
  startedAt: string;
  /** The number the customer saw, when the engine reports one. */
  fromNumber?: string | null;
  /** Set only when the dial failed before connecting. */
  failureReason?: string | null;
  /**
   * Optional so serialisers that predate WhatsApp follow-up keep compiling.
   * When it is absent the lead is resolved by phone number instead — contacts
   * are unique on phone, so that lookup is exact.
   */
  contactId?: string | null;
}

const LEAD_TONE: Record<string, string> = {
  interested: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  callback_requested: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  not_interested: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  no_answer: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  voicemail: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  unknown: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

function fmt(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

export function CallList({ calls, showAgent = true }: { calls: CallRow[]; showAgent?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<CallRow | null>(null);
  const [sendTarget, setSendTarget] = useState<SendMessageTarget | null>(null);
  const [resolving, setResolving] = useState<string | null>(null);

  const filtered = calls.filter((c) => {
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      (c.contactName ?? '').toLowerCase().includes(t) ||
      c.phone.includes(t) ||
      (c.campaignName ?? '').toLowerCase().includes(t)
    );
  });

  /**
   * A call is only worth messaging when it is tied to a lead. The id is used
   * when the page supplies it; otherwise the lead is looked up by phone, which
   * also re-applies the caller's own scoping — an employee cannot message a
   * lead that is no longer theirs.
   */
  async function whatsapp(c: CallRow) {
    const openWith = (recipient: MessageRecipient) =>
      setSendTarget({ recipients: [recipient], callId: c.id, leadStatus: c.leadStatus });

    if (c.contactId) {
      openWith({ id: c.contactId, name: c.contactName, phone: c.phone, leadStatus: c.leadStatus });
      return;
    }

    setResolving(c.id);
    try {
      const res = await fetch(`/api/contacts?q=${encodeURIComponent(c.phone)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = data && typeof data === 'object' ? (data as { error?: string }).error : null;
        throw new Error(message || 'Could not look up this lead');
      }

      const rows: any[] = Array.isArray(data) ? data : [];
      const match = rows.find((r) => r && r.phone === c.phone) ?? null;
      if (!match) throw new Error('That number is not one of your leads any more');

      openWith({
        id: String(match.id),
        name: match.name ?? c.contactName,
        phone: String(match.phone),
        status: match.status ?? null,
        leadStatus: c.leadStatus,
        company: match.company ?? null,
        email: match.email ?? null,
        loanType: match.loanType ?? null,
        loanAmount: typeof match.loanAmount === 'number' ? match.loanAmount : null,
      });
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Could not look up this lead');
    } finally {
      setResolving(null);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[15rem] max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or campaign…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* The search box filters what is on screen; the exports go back to the
            server, which re-applies the same role scoping the page was built
            with — so an employee still only ever gets their own calls. */}
        {calls.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <ExportButton type="calls" label="Export calls" />
            <ExportButton
              type="interested"
              label="Interested leads"
              variant="primary"
              icon={Sparkles}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <PhoneCall className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {calls.length === 0 ? 'No calls yet' : 'No matches'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {calls.length === 0 ? 'Calls appear here once campaigns run.' : 'Try a different search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Customer</th>
                  {showAgent && <th className="px-4 py-3 font-medium">Agent</th>}
                  <th className="px-4 py-3 font-medium">Outcome</th>
                  <th className="px-4 py-3 font-medium text-right">Duration</th>
                  <th className="px-4 py-3 font-medium text-right">When</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {filtered.map((c) => {
                  const hasContact = Boolean(c.contactId || c.contactName);

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{c.contactName || c.phone}</p>
                        {c.contactName && <p className="text-xs text-slate-500">{c.phone}</p>}
                      </td>
                      {showAgent && <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{c.agentName || '—'}</td>}
                      <td className="px-4 py-3">
                        {/* A dial that never connected is not an outcome. Showing
                            "unknown" beside a real result would read as "the
                            customer said nothing", hiding a broken provider. */}
                        {c.failureReason ? (
                          <span
                            title={c.failureReason}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400"
                          >
                            <AlertTriangle className="w-3 h-3" /> not dispatched
                          </span>
                        ) : (
                          <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', LEAD_TONE[c.leadStatus] ?? LEAD_TONE.unknown)}>
                            {c.leadStatus.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(c.durationSec)}</td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">
                        {new Date(c.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasContact && (
                            <button
                              onClick={() => void whatsapp(c)}
                              disabled={resolving === c.id}
                              title="Send a WhatsApp follow-up"
                              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                            >
                              {resolving === c.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <MessageCircle className="w-3.5 h-3.5" />}
                              WhatsApp
                            </button>
                          )}
                          <button onClick={() => setOpen(c)} className="h-8 px-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
                            Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail side panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpen(null)}
          >
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-[#0a1128] border-l border-slate-200 dark:border-white/10 overflow-y-auto"
            >
              <div className="sticky top-0 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
                <div>
                  <h2 className="font-bold text-slate-900 dark:text-white">{open.contactName || open.phone}</h2>
                  <p className="text-xs text-slate-500">{open.phone}</p>
                </div>
                <button onClick={() => setOpen(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Outcome" value={open.leadStatus.replace(/_/g, ' ')} />
                  <Stat label="Duration" value={fmt(open.durationSec)} />
                  <Stat label="Status" value={open.status.replace(/_/g, ' ')} />
                </div>

                {/* Which line called which. Without the caller id there is no
                    way to tell, from a record, which number the customer saw. */}
                <div className="flex items-center gap-3 rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">From</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums truncate">
                      {open.fromNumber ?? 'Not reported'}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1 text-right">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">To</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white tabular-nums truncate">
                      {open.phone}
                    </p>
                  </div>
                </div>

                {open.failureReason && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3.5 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300">Call was not dispatched</p>
                      <p className="text-xs text-red-600/90 dark:text-red-400/80 mt-0.5 leading-relaxed">
                        {open.failureReason.replace(/^Not dispatched:\s*/, '')}
                      </p>
                    </div>
                  </div>
                )}

                {(open.contactId || open.contactName) && (
                  <button
                    onClick={() => void whatsapp(open)}
                    disabled={resolving === open.id}
                    className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                  >
                    {resolving === open.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MessageCircle className="w-4 h-4" />}
                    Send WhatsApp follow-up
                  </button>
                )}

                {open.summary && (
                  <Section icon={FileText} title="AI summary">
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{open.summary}</p>
                  </Section>
                )}

                {open.transcriptText && (
                  <Section icon={Clock} title="Transcript" action={<DownloadTranscript call={open} />}>
                    <div className="space-y-2">
                      {open.transcriptText.split('\n').map((line, i) => {
                        const isCustomer = line.startsWith('Customer:');
                        return (
                          <div key={i} className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
                            <div className={cn(
                              'max-w-[80%] px-3 py-2 rounded-2xl text-sm',
                              isCustomer
                                ? 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                                : 'bg-brand-500/10 text-brand-800 dark:text-brand-200 rounded-tr-sm'
                            )}>
                              {line.replace(/^(Customer|Agent):\s*/, '')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                )}
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <SendMessageDialog target={sendTarget} onClose={() => setSendTarget(null)} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize truncate">{value}</p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: any;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </div>
  );
}

/** The conversation as a readable file, built in the browser from what is
 *  already on screen — no round trip, and it works for a single call, which the
 *  bulk /api/export endpoint is not shaped for. */
function transcriptFile(call: CallRow): { name: string; text: string } {
  const when = new Date(call.startedAt);
  const stamp = when.toISOString().slice(0, 16).replace('T', ' ');
  const who = call.contactName || call.phone;

  const header = [
    'FinBud AI — call transcript',
    '',
    `Customer:   ${who}`,
    `Phone:      ${call.phone}`,
    `Date:       ${stamp}`,
    `Duration:   ${fmt(call.durationSec)}`,
    `Outcome:    ${call.leadStatus.replace(/_/g, ' ')}`,
    call.agentName ? `AI agent:   ${call.agentName}` : null,
    call.campaignName ? `Campaign:   ${call.campaignName}` : null,
    '',
    call.summary ? `Summary:\n${call.summary}\n` : null,
    '─'.repeat(60),
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');

  return {
    name: `finbud-call-${who.replace(/[^\w]+/g, '-').toLowerCase()}-${when.toISOString().slice(0, 10)}.txt`,
    text: `${header}${call.transcriptText ?? '(no transcript captured)'}\n`,
  };
}

function DownloadTranscript({ call }: { call: CallRow }) {
  function download() {
    const { name, text } = transcriptFile(call);
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      title="Download this conversation as a text file"
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-slate-200 dark:border-white/10 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
    >
      <Download className="w-3.5 h-3.5" /> Download
    </button>
  );
}
