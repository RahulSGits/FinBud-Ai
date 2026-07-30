'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, CheckCircle2, Loader2, MessageCircle, Send, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { WhatsAppPreview } from '@/components/messaging/whatsapp-preview';
import { renderTemplate } from '@/lib/messaging/render';
import { cn } from '@/lib/utils';

/** WhatsApp refuses anything longer, so the editor stops the sender first. */
export const WHATSAPP_BODY_LIMIT = 4096;

export interface MessageRecipient {
  /** Contact id — what the API sends to. */
  id: string;
  name: string | null;
  phone: string;
  /** ContactStatus. `do_not_call` is refused by the server, so we say so up front. */
  status?: string | null;
  /** Outcome of this lead's most recent call. Drives the default template. */
  leadStatus?: string | null;
  company?: string | null;
  email?: string | null;
  loanType?: string | null;
  loanAmount?: number | null;
}

export interface SendMessageTarget {
  recipients: MessageRecipient[];
  /** Set when the message follows a specific call, so the two stay linked. */
  callId?: string | null;
  /** Overrides the outcome used to preselect a template. */
  leadStatus?: string | null;
}

interface TemplateRow {
  id: string;
  name: string;
  body: string;
  leadStatus: string | null;
}

interface Attempt {
  who: string;
  reason: string;
}

interface SendReport {
  sent: number;
  failed: Attempt[];
  skipped: Attempt[];
}

/** Statuses that mean the message left the building. */
const DELIVERABLE = ['queued', 'sent', 'delivered', 'read'];

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0,
});

const secondaryClass =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50';

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function size(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.floor(value));
  if (Array.isArray(value)) return value.length;
  return 0;
}

function reason(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}

function pretty(status: string): string {
  return status.replace(/_/g, ' ');
}

function who(r: MessageRecipient): string {
  return r.name || r.phone;
}

/**
 * The renderer owns the shape of its variable bag; borrowing the type keeps this
 * file honest if that contract grows a field.
 */
type RenderVars = Parameters<typeof renderTemplate>[1];

function varsFor(r: MessageRecipient): RenderVars {
  return {
    customer_name: r.name ?? '',
    name: r.name ?? '',
    phone: r.phone,
    company: r.company ?? '',
    email: r.email ?? '',
    loan_type: r.loanType ?? '',
    loan_amount: r.loanAmount != null ? money.format(r.loanAmount) : '',
  } as RenderVars;
}

function render(body: string, r: MessageRecipient): string {
  try {
    return renderTemplate(body, varsFor(r));
  } catch {
    // A half-typed placeholder must not blank the preview mid-keystroke.
    return body;
  }
}

function toTemplates(payload: unknown): TemplateRow[] {
  const box = record(payload);
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(box.templates)
      ? box.templates
      : [];

  return raw
    .map(record)
    .filter((t) => typeof t.id === 'string' && typeof t.body === 'string' && t.isActive !== false)
    .map((t) => ({
      id: String(t.id),
      name: text(t.name) ?? 'Untitled template',
      body: String(t.body),
      leadStatus: text(t.leadStatus),
    }));
}

/**
 * The whole point of the feature: a call that ended as `interested` should open
 * with the "interested" follow-up already loaded. Falls back to a general
 * purpose template (leadStatus null) and then to whatever exists.
 */
function pickDefault(list: TemplateRow[], outcome: string | null): TemplateRow | null {
  if (outcome) {
    const matched = list.find((t) => t.leadStatus === outcome);
    if (matched) return matched;
  }
  return list.find((t) => t.leadStatus === null) ?? list[0] ?? null;
}

/**
 * Turn whatever the send endpoint reported into per-recipient truth. Sales need
 * to know which two of fourteen failed, not that "something went wrong".
 */
function summarise(payload: unknown, recipients: MessageRecipient[]): SendReport {
  const box = record(payload);
  const list: unknown[] | null = Array.isArray(payload)
    ? payload
    : Array.isArray(box.results)
      ? box.results
      : Array.isArray(box.outcomes)
        ? box.outcomes
        : Array.isArray(box.messages)
          ? box.messages
          : null;

  if (!list) {
    // No per-recipient detail came back; report the counts rather than invent names.
    const failed = size(box.failed);
    const skipped = size(box.skipped);
    const sent = typeof box.sent === 'number'
      ? size(box.sent)
      : Math.max(0, recipients.length - failed - skipped);
    return {
      sent: Math.min(sent, recipients.length),
      failed: Array.from({ length: failed }, () => ({
        who: 'A recipient', reason: 'The server did not say which one',
      })),
      skipped: Array.from({ length: skipped }, () => ({
        who: 'A recipient', reason: 'Skipped by the server',
      })),
    };
  }

  const byId: Record<string, MessageRecipient> = {};
  const byPhone: Record<string, MessageRecipient> = {};
  for (const r of recipients) {
    byId[r.id] = r;
    byPhone[r.phone] = r;
  }

  const failed: Attempt[] = [];
  const skipped: Attempt[] = [];
  let sent = 0;

  for (const entry of list) {
    const row = record(entry);
    const id = text(row.contactId);
    const to = text(row.to) ?? text(row.phone);
    const match = (id ? byId[id] : undefined) ?? (to ? byPhone[to] : undefined);
    const name = match ? who(match) : (to ?? 'Unknown recipient');

    const status = text(row.status);
    const problem = text(row.error) ?? text(row.reason);
    const wasSkipped = row.skipped === true || status === 'skipped';
    const wasFailed =
      !wasSkipped &&
      (row.ok === false || status === 'failed' || (problem !== null && !DELIVERABLE.includes(status ?? '')));

    if (wasSkipped) skipped.push({ who: name, reason: problem ?? 'Marked do not call' });
    else if (wasFailed) failed.push({ who: name, reason: problem ?? 'The provider rejected it' });
    else sent += 1;
  }

  return { sent, failed, skipped };
}

function summaryLine(report: SendReport): string {
  const parts = [`sent ${report.sent}`];
  if (report.failed.length > 0) parts.push(`${report.failed.length} failed`);
  if (report.skipped.length > 0) parts.push(`${report.skipped.length} skipped`);
  return parts.join(', ');
}

export function SendMessageDialog({
  target, onClose, onSent,
}: {
  /** Null closes the dialog. A fresh object each time resets the composer. */
  target: SendMessageTarget | null;
  onClose: () => void;
  onSent?: () => void;
}) {
  return (
    <AnimatePresence>
      {target && target.recipients.length > 0 && (
        <Composer target={target} onClose={onClose} onSent={onSent} />
      )}
    </AnimatePresence>
  );
}

function Composer({
  target, onClose, onSent,
}: {
  target: SendMessageTarget;
  onClose: () => void;
  onSent?: () => void;
}) {
  const router = useRouter();

  const recipients = target.recipients;
  const first = recipients[0];
  const bulk = recipients.length > 1;

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [report, setReport] = useState<SendReport | null>(null);

  // Which outcome the default template is chosen for: the caller's, or the one
  // most of these leads' last calls ended on.
  const outcome = useMemo(() => {
    if (target.leadStatus) return target.leadStatus;
    const tally: Record<string, number> = {};
    for (const r of recipients) {
      if (!r.leadStatus) continue;
      tally[r.leadStatus] = (tally[r.leadStatus] ?? 0) + 1;
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [status, count] of Object.entries(tally)) {
      if (count > bestCount) {
        best = status;
        bestCount = count;
      }
    }
    return best;
  }, [recipients, target.leadStatus]);

  const outcomeCount = useMemo(
    () => (outcome ? recipients.filter((r) => r.leadStatus === outcome).length : 0),
    [recipients, outcome]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/message-templates');
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(text(record(data).error) ?? 'Could not load templates');
        if (cancelled) return;

        const list = toTemplates(data);
        setTemplates(list);

        const chosen = pickDefault(list, outcome);
        if (chosen) {
          setTemplateId(chosen.id);
          setBody(chosen.body);
        }
      } catch (e) {
        if (!cancelled) setLoadError(reason(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [outcome]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, sending]);

  const selected = templates.find((t) => t.id === templateId) ?? null;
  const preview = useMemo(() => render(body, first), [body, first]);
  const over = body.length > WHATSAPP_BODY_LIMIT || preview.length > WHATSAPP_BODY_LIMIT;

  const blocked = recipients.filter((r) => r.status === 'do_not_call');
  const allBlocked = blocked.length === recipients.length;

  const hint = !outcome
    ? bulk
      ? 'None of these leads has a call outcome yet, so a general-purpose template is preselected.'
      : 'This lead has not been called yet, so a general-purpose template is preselected.'
    : selected && selected.leadStatus === outcome
      ? bulk
        ? `Preselected because “${pretty(outcome)}” was the last call outcome for ${outcomeCount} of ${recipients.length} recipients.`
        : `Preselected because the last call with ${who(first)} ended as “${pretty(outcome)}”.`
      : `No template is tied to “${pretty(outcome)}” yet, so a general-purpose one is preselected.`;

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const next = templates.find((t) => t.id === id);
    // An explicit pick replaces the draft — that is what picking one means.
    if (next) setBody(next.body);
  }

  async function send() {
    const draft = body.trim();
    if (!draft) {
      toast.error('Write something first');
      return;
    }
    if (over) {
      toast.error(`WhatsApp caps a message at ${WHATSAPP_BODY_LIMIT} characters`);
      return;
    }

    setSending(true);
    try {
      // The raw body goes up, placeholders intact: the server renders it once
      // per contact so each person sees their own name and loan details.
      const payload: Record<string, unknown> = { body: draft };
      if (templateId) payload.templateId = templateId;
      if (target.callId) payload.callId = target.callId;
      if (bulk) payload.contactIds = recipients.map((r) => r.id);
      else payload.contactId = first.id;

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(text(record(data).error) ?? `Could not send (${res.status})`);

      const result = summarise(data, recipients);
      setReport(result);

      if (result.failed.length === 0 && result.skipped.length === 0) {
        toast.success(bulk ? `Sent to ${result.sent} people` : `Message sent to ${who(first)}`);
      } else if (result.sent === 0) {
        toast.error(`Nothing went out — ${summaryLine(result)}`);
      } else {
        toast.warning(summaryLine(result));
      }

      onSent?.();
      router.refresh();
    } catch (e) {
      toast.error(reason(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={() => !sending && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Send WhatsApp"
        className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Send WhatsApp</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate tabular-nums">
                {bulk ? `${recipients.length} recipients` : `${who(first)} · ${first.phone}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Close"
            className="p-1.5 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {report ? (
          <Result
            report={report}
            total={recipients.length}
            onBack={() => setReport(null)}
            onClose={onClose}
          />
        ) : (
          <>
            <div className="p-6 grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
              <div className="space-y-4 min-w-0">
                <div>
                  <label
                    htmlFor="whatsapp-template"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Template
                  </label>
                  {loading ? (
                    <div className="flex items-center gap-2 h-10 px-3.5 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-500">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading templates…
                    </div>
                  ) : (
                    <select
                      id="whatsapp-template"
                      value={templateId}
                      onChange={(e) => chooseTemplate(e.target.value)}
                      className="w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Write it myself</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.leadStatus ? `${t.name} — for ${pretty(t.leadStatus)}` : t.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    {loadError
                      ? `${loadError} — you can still write the message yourself.`
                      : templates.length === 0 && !loading
                        ? 'No templates yet. Write the message here, or add one under Templates.'
                        : hint}
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="whatsapp-body"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5"
                  >
                    Message
                  </label>
                  <textarea
                    id="whatsapp-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={9}
                    placeholder="Hi {{customer_name}}, thanks for your time today…"
                    className="w-full rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Edit freely — {'{{placeholders}}'} are filled in per contact when it goes out.
                    </p>
                    <p
                      className={cn(
                        'text-[11px] tabular-nums shrink-0',
                        over
                          ? 'font-semibold text-red-600 dark:text-red-400'
                          : 'text-slate-500 dark:text-slate-400'
                      )}
                    >
                      {body.length} / {WHATSAPP_BODY_LIMIT}
                      {preview.length !== body.length ? ` · ${preview.length} sent` : ''}
                    </p>
                  </div>
                </div>

                {bulk && (
                  <section>
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-slate-400" />
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {recipients.length} recipients
                      </h3>
                    </div>
                    <ul className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06]">
                      {recipients.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-3 px-3.5 py-2">
                          <span className="text-xs text-slate-700 dark:text-slate-200 truncate">
                            {who(r)}
                          </span>
                          <span className="flex items-center gap-2 shrink-0">
                            {r.status === 'do_not_call' && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400">
                                do not call
                              </span>
                            )}
                            <span className="text-[11px] text-slate-500 tabular-nums">{r.phone}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                      Each message is rendered separately, so every contact sees their own name and
                      loan details.
                    </p>
                  </section>
                )}

                {blocked.length > 0 && (
                  <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-3.5 py-3">
                    <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed">
                      {allBlocked
                        ? bulk
                          ? 'Every one of these contacts is marked do not call. The server will refuse all of them, so there is nothing to send.'
                          : `${who(first)} is marked do not call. The server will refuse this message.`
                        : `${blocked.length} of these contacts ${blocked.length === 1 ? 'is' : 'are'} marked do not call — the server skips them and nothing reaches those numbers.`}
                    </p>
                  </div>
                )}
                {bulk && blocked.length === 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Anyone marked do not call is skipped by the server, and reported back as skipped.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <div className="lg:sticky lg:top-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                    Preview{bulk ? ` — ${who(first)}` : ''}
                  </h3>
                  <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-3">
                    <WhatsAppPreview body={preview} contactName={who(first)} />
                  </div>
                  {bulk && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                      The other {recipients.length - 1} get the same message with their own details.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
              <button onClick={onClose} disabled={sending} className={secondaryClass}>
                Cancel
              </button>
              <button
                onClick={() => void send()}
                disabled={sending || allBlocked || over || body.trim() === ''}
                className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {bulk ? `Send to ${recipients.length}` : 'Send message'}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function Result({
  report, total, onBack, onClose,
}: {
  report: SendReport;
  total: number;
  onBack: () => void;
  onClose: () => void;
}) {
  const clean = report.failed.length === 0 && report.skipped.length === 0;

  return (
    <>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'w-9 h-9 shrink-0 rounded-xl flex items-center justify-center',
              clean ? 'bg-emerald-500/10' : 'bg-amber-500/10'
            )}
          >
            {clean ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-white first-letter:uppercase">
              {summaryLine(report)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              out of {total} {total === 1 ? 'recipient' : 'recipients'}
            </p>
          </div>
        </div>

        {report.failed.length > 0 && (
          <AttemptList
            title={`${report.failed.length} failed`}
            tone="failed"
            attempts={report.failed}
          />
        )}
        {report.skipped.length > 0 && (
          <AttemptList
            title={`${report.skipped.length} skipped`}
            tone="skipped"
            attempts={report.skipped}
          />
        )}
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
        {report.failed.length > 0 && (
          <button onClick={onBack} className={secondaryClass}>
            Back to the message
          </button>
        )}
        <button
          onClick={onClose}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
        >
          Done
        </button>
      </div>
    </>
  );
}

function AttemptList({
  title, tone, attempts,
}: {
  title: string;
  tone: 'failed' | 'skipped';
  attempts: Attempt[];
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
        {title}
      </h3>
      <ul className="rounded-xl border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/[0.06]">
        {attempts.map((a, i) => (
          <li key={`${a.who}-${i}`} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
              {a.who}
            </span>
            <span
              className={cn(
                'text-xs text-right min-w-0 break-words',
                tone === 'failed'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {a.reason}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
