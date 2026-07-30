'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import {
  Plus, X, Loader2, Upload, FileSpreadsheet, Pencil, Trash2,
  AlertTriangle, Bot, Save,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ACCEPTED_TYPES, parseContactFile, type ImportResult } from '@/lib/contacts/import';
import { parseBusinessHours } from '@/lib/campaigns/business-hours';

export interface CampaignAgentOption {
  id: string;
  name: string;
  isActive: boolean;
}

/** The subset of a campaign the form can edit. `businessHours` is raw column JSON. */
export interface CampaignEditable {
  id: string;
  name: string;
  agentId: string;
  concurrency: number;
  dailyCallLimit: number | null;
  retryLimit: number;
  retryDelayMins: number;
  businessHours: unknown;
  scheduledAt: string | null;
}

interface Props {
  /**
   * Agents this caller may dial with. Filtered by the server page (an employee
   * sees every active agent plus their own drafts), never here.
   */
  agents: CampaignAgentOption[];
  /**
   * Contacts already in the database with no campaign, offered as a shortcut.
   * Scoped to whatever `audience` says, because that is what the API attaches.
   */
  unassignedCount: number;
  /** Present for edit mode. */
  campaign?: CampaignEditable;
  /** Renders the trigger as a full-width primary button (used by the empty state). */
  emphasis?: boolean;
  /**
   * Whose leads this campaign draws on. `mine` is the employee case: the API
   * only ever attaches contacts assigned to the caller, so the copy must say so
   * rather than implying the whole contact book is in play.
   */
  audience?: 'all' | 'mine';
  /** Route root for links out of the dialog: employees live under /dashboard. */
  basePath?: '/admin' | '/dashboard';
  /**
   * Who imported rows belong to. Set on the employee page so a freshly imported
   * list shows up under My leads instead of belonging to nobody — an unassigned
   * contact is invisible to the employee who created it.
   */
  ownerId?: string | null;
}

interface Draft {
  name: string;
  agentId: string;
  concurrency: string;
  dailyCallLimit: string;
  retryLimit: string;
  retryDelayMins: string;
  tz: string;
  days: number[];
  start: string;
  end: string;
  scheduledAt: string;
  attachUnassigned: boolean;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DEFAULT_DAYS = [1, 2, 3, 4, 5, 6];

const INPUT =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

// Without an explicit colour-scheme the browser draws its native clock/calendar
// glyph in dark ink, which vanishes against the dark input.
const TIME_INPUT = `${INPUT} dark:[color-scheme:dark]`;

/** ISO -> the `YYYY-MM-DDTHH:mm` shape datetime-local demands, in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toInt(raw: string, fallback: number, lo: number, hi: number): number {
  const n = Math.trunc(Number(raw));
  if (!raw.trim() || !Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(n, hi));
}

function makeDraft(campaign: CampaignEditable | undefined, agents: CampaignAgentOption[]): Draft {
  const hours = parseBusinessHours(campaign?.businessHours);
  return {
    name: campaign?.name ?? '',
    agentId: campaign?.agentId ?? agents.find((a) => a.isActive)?.id ?? '',
    concurrency: String(campaign?.concurrency ?? 3),
    dailyCallLimit: campaign?.dailyCallLimit ? String(campaign.dailyCallLimit) : '',
    retryLimit: String(campaign?.retryLimit ?? 1),
    retryDelayMins: String(campaign?.retryDelayMins ?? 60),
    tz: hours?.tz ?? 'Asia/Kolkata',
    days: hours?.days.length ? hours.days : DEFAULT_DAYS,
    start: hours?.start ?? '09:00',
    end: hours?.end ?? '20:00',
    scheduledAt: toLocalInput(campaign?.scheduledAt ?? null),
    attachUnassigned: false,
  };
}

export function CampaignForm({
  agents,
  unassignedCount,
  campaign,
  emphasis,
  audience = 'all',
  basePath = '/admin',
  ownerId,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => makeDraft(campaign, agents));

  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const editing = Boolean(campaign);
  const hasActiveAgent = agents.some((a) => a.isActive);
  const selectedAgent = agents.find((a) => a.id === draft.agentId) ?? null;
  const mine = audience === 'mine';

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function openForm() {
    setDraft(makeDraft(campaign, agents));
    setFile(null);
    setParsed(null);
    setParsing(false);
    setDragging(false);
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  function clearFile() {
    setFile(null);
    setParsed(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function handleFile(f: File) {
    setParsing(true);
    setParsed(null);
    setFile(f);
    try {
      const result = await parseContactFile(f);
      setParsed(result);
      if (result.contacts.length === 0) {
        toast.error(`No usable phone numbers in ${f.name}.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not read that file.');
      clearFile();
    } finally {
      setParsing(false);
    }
  }

  // Dragging over a child element fires dragleave on the drop zone itself, so
  // only drop the highlight once the pointer has genuinely left it.
  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  }

  function toggleDay(day: number) {
    setDraft((d) => ({
      ...d,
      days: d.days.includes(day) ? d.days.filter((x) => x !== day) : [...d.days, day].sort((a, b) => a - b),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;

    const name = draft.name.trim();
    if (!name) { toast.error('Give the campaign a name.'); return; }
    if (!draft.agentId) { toast.error('Pick an agent for this campaign.'); return; }
    if (draft.days.length === 0) { toast.error('Pick at least one calling day.'); return; }
    if (!draft.start || !draft.end) { toast.error('Set the start and end of the calling window.'); return; }

    const payload = {
      ...(campaign ? { id: campaign.id } : {}),
      name,
      agentId: draft.agentId,
      concurrency: toInt(draft.concurrency, 1, 1, 50),
      dailyCallLimit: draft.dailyCallLimit.trim() ? toInt(draft.dailyCallLimit, 1, 1, 100_000) : null,
      retryLimit: toInt(draft.retryLimit, 1, 0, 10),
      retryDelayMins: toInt(draft.retryDelayMins, 60, 1, 10_080),
      businessHours: {
        tz: draft.tz.trim() || 'Asia/Kolkata',
        days: [...draft.days].sort((a, b) => a - b),
        start: draft.start,
        end: draft.end,
      },
      scheduledAt: draft.scheduledAt || null,
      attachUnassigned: draft.attachUnassigned,
    };

    setBusy(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the campaign.');

      const campaignId: string = data.id ?? campaign?.id ?? '';
      toast.success(editing ? 'Campaign updated' : `Campaign “${name}” created`);

      if (typeof data.attached === 'number' && data.attached > 0) {
        toast.success(`${data.attached} existing contact${data.attached === 1 ? '' : 's'} moved into this campaign`);
      }

      // Contacts go in after the campaign exists, so every imported row lands
      // in it rather than being orphaned by a half-failed create.
      if (parsed && parsed.contacts.length > 0 && campaignId) {
        const importRes = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contacts: parsed.contacts,
            campaignId,
            // An employee's own import has to land in their lead list, or they
            // could not see or work the very rows they just uploaded.
            ...(mine && ownerId ? { assignedToId: ownerId } : {}),
          }),
        });
        const importData = await importRes.json().catch(() => ({}));

        if (!importRes.ok) {
          toast.error(importData.error || 'The campaign was saved, but the contact import failed.');
        } else {
          toast.success(
            `${importData.created ?? 0} added · ${importData.updated ?? 0} updated · ${importData.skipped ?? 0} skipped`
          );
          if (Array.isArray(importData.invalidSamples) && importData.invalidSamples.length > 0) {
            toast.warning(`Unusable numbers: ${importData.invalidSamples.join(', ')}`);
          }
        }
      }

      setOpen(false);
      clearFile();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  const preview = parsed ? parsed.contacts.slice(0, 5) : [];

  return (
    <>
      {editing ? (
        <button
          type="button"
          onClick={openForm}
          title="Edit campaign"
          aria-label={`Edit ${campaign?.name ?? 'campaign'}`}
          className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <Pencil className="w-4 h-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={openForm}
          className={cn(
            'inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors',
            emphasis && 'h-10 px-5'
          )}
        >
          <Plus className="w-4 h-4" /> New campaign
        </button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
            onClick={close}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl my-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 flex flex-col max-h-[calc(100vh-2rem)]"
            >
              <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-slate-200 dark:border-white/10">
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {editing ? 'Edit campaign' : 'New campaign'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {editing
                      ? 'Changes apply from the next dialling tick.'
                      : 'Created as a draft — nothing dials until you press Start calling.'}
                  </p>
                </div>
                <button type="button" onClick={close} className="p-1 -mr-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {!editing && !hasActiveAgent ? (
                <div className="px-6 py-12 text-center">
                  <Bot className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No active agents</p>
                  <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm mx-auto">
                    A campaign dials with an agent. Build one, switch it to Active, then come back here.
                  </p>
                  <Link
                    href={`${basePath}/agents/new`}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Create an agent
                  </Link>
                </div>
              ) : (
                <form onSubmit={submit} className="flex flex-col min-h-0 flex-1">
                  <div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
                    {/* 1 — Basics */}
                    <Step n={1} title="Name and agent">
                      <Field label="Campaign name" required>
                        <input
                          value={draft.name}
                          onChange={(e) => set('name', e.target.value)}
                          placeholder="July personal-loan follow-ups"
                          className={INPUT}
                        />
                      </Field>
                      <Field label="Agent" required>
                        <select value={draft.agentId} onChange={(e) => set('agentId', e.target.value)} className={INPUT}>
                          <option value="">Select an agent…</option>
                          {agents.map((a) => {
                            // The campaign's current agent stays selectable even after it
                            // has been deactivated, so editing is never blocked by it.
                            const locked = !a.isActive && a.id !== campaign?.agentId;
                            return (
                              <option key={a.id} value={a.id} disabled={locked}>
                                {a.isActive ? a.name : `${a.name} — draft, activate it before it can dial`}
                              </option>
                            );
                          })}
                        </select>
                      </Field>
                      {selectedAgent && !selectedAgent.isActive && (
                        <Callout>
                          <strong className="font-semibold">{selectedAgent.name}</strong> is still a draft. The campaign
                          will save, but starting it fails until the agent is switched to Active.
                        </Callout>
                      )}
                    </Step>

                    {/* 2 — Contacts */}
                    <Step
                      n={2}
                      title="Contact list"
                      hint={
                        mine && ownerId
                          ? 'CSV, TSV or Excel. Columns are detected automatically, and imported rows become your leads.'
                          : 'CSV, TSV or Excel. Columns are detected automatically.'
                      }
                    >
                      <input
                        ref={fileRef}
                        type="file"
                        accept={ACCEPTED_TYPES}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleFile(f);
                        }}
                      />

                      {!file ? (
                        <div
                          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => {
                            e.preventDefault();
                            setDragging(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) void handleFile(f);
                          }}
                          className={cn(
                            'rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors',
                            dragging
                              ? 'border-brand-500 bg-brand-500/5'
                              : 'border-slate-200 dark:border-white/10'
                          )}
                        >
                          <Upload className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Drop your list here</p>
                          <p className="text-xs text-slate-500 mt-1 mb-3">Nothing is uploaded until you save.</p>
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                          >
                            <FileSpreadsheet className="w-4 h-4" /> Choose a file
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-white/[0.03]">
                            <div className="min-w-0 flex items-center gap-2.5">
                              <FileSpreadsheet className="w-4 h-4 shrink-0 text-brand-600 dark:text-brand-400" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{file.name}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {parsing
                                    ? 'Reading…'
                                    : parsed
                                      ? `Read ${parsed.contacts.length} of ${parsed.totalRows} row${parsed.totalRows === 1 ? '' : 's'}, ${
                                          parsed.mapping.phone
                                            ? `using column “${parsed.mapping.phone}” as phone`
                                            : 'using the first phone-shaped column as phone'
                                        }`
                                      : 'Could not read this file'}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={clearFile}
                              className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              aria-label="Remove file"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>

                          {parsing && (
                            <div className="px-4 py-6 flex items-center justify-center">
                              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                            </div>
                          )}

                          {parsed && preview.length > 0 && (
                            <div className="overflow-x-auto border-t border-slate-200 dark:border-white/10">
                              <table className="w-full text-sm min-w-[420px]">
                                <thead className="bg-white dark:bg-[#0a1128]">
                                  <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                                    <th className="px-4 py-2 font-medium">Name</th>
                                    <th className="px-4 py-2 font-medium">Phone</th>
                                    <th className="px-4 py-2 font-medium">Company</th>
                                    <th className="px-4 py-2 font-medium">Loan</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                                  {preview.map((c, i) => (
                                    <tr key={`${c.phone}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                                      <td className="px-4 py-2 text-slate-900 dark:text-white">{c.name || '—'}</td>
                                      <td className="px-4 py-2 tabular-nums text-slate-600 dark:text-slate-300">{c.phone}</td>
                                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.company || '—'}</td>
                                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{c.loanType || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}

                          {parsed && (
                            <div className="px-4 py-3 border-t border-slate-200 dark:border-white/10 space-y-1">
                              {parsed.contacts.length > preview.length && (
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  Showing the first {preview.length} of {parsed.contacts.length}.
                                </p>
                              )}
                              {parsed.skipped > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                  {parsed.skipped} row{parsed.skipped === 1 ? '' : 's'} skipped — no usable phone number.
                                </p>
                              )}
                              {parsed.contacts.length === 0 && (
                                <p className="text-xs text-red-600 dark:text-red-400">
                                  Nothing importable here. Detected columns: {parsed.headers.join(', ') || 'none'}.
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {unassignedCount > 0 && (
                        <label className="flex items-start gap-2.5 mt-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={draft.attachUnassigned}
                            onChange={(e) => set('attachUnassigned', e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded accent-brand-600"
                          />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {mine
                              ? `Add your ${unassignedCount} lead${unassignedCount === 1 ? '' : 's'} not yet in any campaign`
                              : `Add the ${unassignedCount} contact${unassignedCount === 1 ? '' : 's'} not yet in any campaign`}
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {mine
                                ? 'Only leads assigned to you are added — never anyone else’s.'
                                : 'Already-imported leads with no campaign of their own.'}
                            </span>
                          </span>
                        </label>
                      )}
                    </Step>

                    {/* 3 — Pacing */}
                    <Step n={3} title="Pacing" hint="How hard this campaign dials.">
                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="Concurrent calls" hint="1–50 at once.">
                          <input
                            type="number" min={1} max={50}
                            value={draft.concurrency}
                            onChange={(e) => set('concurrency', e.target.value)}
                            className={INPUT}
                          />
                        </Field>
                        <Field label="Daily call limit" hint="Leave blank for no cap.">
                          <input
                            type="number" min={1}
                            value={draft.dailyCallLimit}
                            onChange={(e) => set('dailyCallLimit', e.target.value)}
                            placeholder="No limit"
                            className={INPUT}
                          />
                        </Field>
                        <Field label="Retries per contact" hint="0 means one attempt only.">
                          <input
                            type="number" min={0} max={10}
                            value={draft.retryLimit}
                            onChange={(e) => set('retryLimit', e.target.value)}
                            className={INPUT}
                          />
                        </Field>
                        <Field label="Retry delay (minutes)">
                          <input
                            type="number" min={1}
                            value={draft.retryDelayMins}
                            onChange={(e) => set('retryDelayMins', e.target.value)}
                            className={INPUT}
                          />
                        </Field>
                      </div>
                    </Step>

                    {/* 4 — Calling window */}
                    <Step n={4} title="Calling hours" hint="Outside these hours the campaign waits instead of dialling.">
                      <Field label="Timezone">
                        <input
                          value={draft.tz}
                          onChange={(e) => set('tz', e.target.value)}
                          placeholder="Asia/Kolkata"
                          className={INPUT}
                        />
                      </Field>

                      <div>
                        <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Days</span>
                        <div className="flex flex-wrap gap-1.5">
                          {DAYS.map((label, i) => {
                            const on = draft.days.includes(i);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => toggleDay(i)}
                                aria-pressed={on}
                                className={cn(
                                  'h-9 px-3 rounded-xl border text-xs font-medium transition-colors',
                                  on
                                    ? 'bg-brand-600 border-brand-600 text-white'
                                    : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
                                )}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-4">
                        <Field label="From">
                          <input type="time" value={draft.start} onChange={(e) => set('start', e.target.value)} className={TIME_INPUT} />
                        </Field>
                        <Field label="Until">
                          <input type="time" value={draft.end} onChange={(e) => set('end', e.target.value)} className={TIME_INPUT} />
                        </Field>
                      </div>
                    </Step>

                    {/* 5 — Schedule */}
                    <Step n={5} title="Start later" hint="Optional. The campaign still has to be started by hand.">
                      <Field label="Hold dialling until">
                        <input
                          type="datetime-local"
                          value={draft.scheduledAt}
                          onChange={(e) => set('scheduledAt', e.target.value)}
                          className={TIME_INPUT}
                        />
                      </Field>
                    </Step>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-white/10">
                    <button
                      type="button"
                      onClick={close}
                      disabled={busy}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={busy || parsing}
                      className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {editing ? 'Save changes' : 'Create campaign'}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export function DeleteCampaignButton({ id, name, status }: { id: string; name: string; status: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  const running = status === 'running';

  async function remove() {
    setBusy(true);
    setBlocked(null);
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        // The server refuses while calls are still in flight — say so in place
        // rather than closing the dialog on a failure.
        setBlocked(data.error || 'This campaign is running. Stop it first.');
        toast.error(data.error || 'Stop the campaign before deleting it.');
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Could not delete the campaign.');

      toast.success(`Campaign “${name}” deleted`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not delete the campaign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => { setBlocked(null); setOpen(true); }}
        title="Delete campaign"
        aria-label={`Delete ${name}`}
        className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:border-red-500/40 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !busy && setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Delete “{name}”?</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                The campaign is removed. Its contacts and the calls already made are kept — they simply stop belonging
                to a campaign.
              </p>

              {(running || blocked) && (
                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {blocked ??
                      'This campaign is running. Press Stop on it first — the server refuses to delete a campaign with calls in flight.'}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Step({
  n, title, hint, children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-start gap-3 mb-3">
        <span className="shrink-0 w-6 h-6 rounded-lg bg-brand-500/10 text-brand-700 dark:text-brand-400 text-xs font-semibold flex items-center justify-center tabular-nums">
          {n}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
          {hint && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
        </div>
      </div>
      <div className="space-y-4 sm:pl-9">{children}</div>
    </section>
  );
}

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-slate-500 dark:text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3">
      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-amber-700 dark:text-amber-300">{children}</p>
    </div>
  );
}
