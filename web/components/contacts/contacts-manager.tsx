'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, FileSpreadsheet, Loader2, MessageCircle, PhoneCall, Search, Tag,
  Trash2, Upload, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ACCEPTED_TYPES, parseContactFile, type ImportResult } from '@/lib/contacts/import';
import { ExportButton } from '@/components/export/export-button';
import {
  BulkCallDialog,
  type BulkCallAgentOption,
} from '@/components/campaigns/bulk-call-dialog';
import {
  SendMessageDialog,
  type MessageRecipient,
  type SendMessageTarget,
} from '@/components/messaging/send-message-dialog';
import { cn } from '@/lib/utils';

export interface ContactCallRow {
  id: string;
  status: string;
  leadStatus: string;
  durationSec: number;
  summary: string | null;
  startedAt: string;
}

export interface ContactRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  loanType: string | null;
  loanAmount: number | null;
  status: string;
  tags: string[];
  attempts: number;
  assignedToId: string | null;
  assignedToName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  callCount: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  createdAt: string;
  customFields: Record<string, unknown> | null;
  /** Newest first, capped by the server — enough for the detail panel. */
  calls: ContactCallRow[];
}

export interface NamedOption {
  id: string;
  name: string;
}

interface Confirm {
  title: string;
  body: string;
  label: string;
  run: () => Promise<void>;
}

const STATUSES = ['pending', 'calling', 'retry', 'completed', 'exhausted', 'do_not_call'];

/** The outcomes sales chase with a follow-up message. */
const WARM_OUTCOMES = ['interested', 'callback_requested'];

const TONE: Record<string, string> = {
  pending: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  calling: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  retry: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  exhausted: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  do_not_call: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

const LEAD_TONE: Record<string, string> = {
  interested: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  callback_requested: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  not_interested: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  no_answer: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  voicemail: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  unknown: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

const IMPORT_FIELDS: { key: string; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Company' },
  { key: 'loanType', label: 'Loan type' },
  { key: 'loanAmount', label: 'Loan amount' },
];

/** Server caps a single import at 5,000 rows. */
const IMPORT_CAP = 5000;

const inputClass =
  'w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

const rowSelectClass =
  'h-8 max-w-[10rem] rounded-lg bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 px-2 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500';

const secondaryClass =
  'inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors disabled:opacity-50';

function pretty(value: string): string {
  return value.replace(/_/g, ' ');
}

function inr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(amount);
}

function when(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function duration(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function reason(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}

/** The outcome of the most recent call, which is what picks the template. */
function lastOutcome(row: ContactRow): string | null {
  return row.calls[0]?.leadStatus ?? null;
}

function toRecipient(row: ContactRow): MessageRecipient {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    leadStatus: lastOutcome(row),
    company: row.company,
    email: row.email,
    loanType: row.loanType,
    loanAmount: row.loanAmount,
  };
}

async function request(url: string, method: string, body?: unknown): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  // The API returns actionable refusals ("no active agent", "daily call limit
  // reached") — surface those rather than a generic failure.
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/** Runs in small waves: there is no bulk endpoint, and 500 parallel requests stall the browser. */
async function batched(ids: string[], run: (id: string) => Promise<boolean>): Promise<number> {
  let ok = 0;
  for (let i = 0; i < ids.length; i += 8) {
    const results = await Promise.all(ids.slice(i, i + 8).map(run));
    ok += results.filter(Boolean).length;
  }
  return ok;
}

export function ContactsManager({
  contacts, employees, campaigns, agents,
}: {
  contacts: ContactRow[];
  employees: NamedOption[];
  campaigns: NamedOption[];
  /**
   * Agents the caller may dial with. Optional: when the page does not supply
   * them they are fetched on demand, the first time a bulk run is opened.
   */
  agents?: BulkCallAgentOption[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<ContactRow[]>(contacts);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Held as an id, not a row, so the panel follows optimistic updates.
  const [detailId, setDetailId] = useState<string | null>(null);
  const [dialling, setDialling] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendMessageTarget | null>(null);

  const [agentOptions, setAgentOptions] = useState<BulkCallAgentOption[]>(agents ?? []);
  const [agentsLoaded, setAgentsLoaded] = useState(Boolean(agents));
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [bulkCallOpen, setBulkCallOpen] = useState(false);

  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<(ImportResult & { fileName: string }) | null>(null);
  const [importCampaign, setImportCampaign] = useState('');
  const [importAssignee, setImportAssignee] = useState('');
  const [importing, setImporting] = useState(false);

  // router.refresh() re-renders the server page; adopt the fresh rows and drop
  // selections for anything that no longer exists.
  useEffect(() => {
    setRows(contacts);
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(contacts.map((c) => c.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (live.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [contacts]);

  // A page that supplies agents owns them; never let a fetched list shadow a
  // fresher server-rendered one.
  useEffect(() => {
    if (!agents) return;
    setAgentOptions(agents);
    setAgentsLoaded(true);
  }, [agents]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      map[r.status] = (map[r.status] ?? 0) + 1;
    });
    return map;
  }, [rows]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (status && r.status !== status) return false;
      if (!term) return true;
      return (
        (r.name ?? '').toLowerCase().includes(term) ||
        r.phone.toLowerCase().includes(term) ||
        (r.company ?? '').toLowerCase().includes(term)
      );
    });
  }, [rows, q, status]);

  // Everyone whose last call went well — the list sales actually follow up on.
  // Deliberately the whole book rather than the filtered view: the button says
  // "all interested", so it must mean all of them.
  const warm = useMemo(
    () => rows.filter((r) => WARM_OUTCOMES.indexOf(lastOutcome(r) ?? '') !== -1),
    [rows]
  );

  const selectedIds = Array.from(selected);
  const allShownSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const detail = detailId ? rows.find((r) => r.id === detailId) ?? null : null;

  const selectedRows = useMemo(() => rows.filter((r) => selected.has(r.id)), [rows, selected]);

  // What a bulk run could actually dial. A contact who asked not to be called
  // never goes into one, and a contact already on a call has nothing to claim.
  const dialableSelected = useMemo(
    () => selectedRows.filter((r) => r.status !== 'do_not_call' && r.status !== 'calling'),
    [selectedRows]
  );

  const bulkCallHint =
    dialableSelected.length > 0
      ? 'Queue these contacts as a bulk calling run'
      : selectedRows.every((r) => r.status === 'do_not_call')
        ? 'Every selected contact is marked do-not-call'
        : 'Every selected contact is already on a call or marked do-not-call';

  function patchRow(id: string, changes: Partial<ContactRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (filtered.length > 0 && filtered.every((r) => prev.has(r.id))) {
        filtered.forEach((r) => next.delete(r.id));
      } else {
        filtered.forEach((r) => next.add(r.id));
      }
      return next;
    });
  }

  function messageSelected() {
    const chosen = rows.filter((r) => selected.has(r.id));
    if (chosen.length === 0) return;
    setSendTarget({ recipients: chosen.map(toRecipient) });
  }

  /**
   * Open the bulk-call dialog, fetching the agent list first if the page did
   * not supply one. Fetched here rather than on mount because most visits to
   * this screen never start a bulk run.
   */
  async function openBulkCall() {
    if (dialableSelected.length === 0 || agentsLoading) return;

    if (!agentsLoaded) {
      setAgentsLoading(true);
      try {
        const data = await request('/api/agents', 'GET');
        const list: any[] = Array.isArray(data) ? data : [];
        setAgentOptions(
          list.map((a) => ({
            id: String(a?.id ?? ''),
            name: String(a?.name ?? 'Untitled agent'),
            isActive: a?.isActive === true,
          }))
        );
        setAgentsLoaded(true);
      } catch (e) {
        toast.error(reason(e));
        return;
      } finally {
        setAgentsLoading(false);
      }
    }

    setBulkCallOpen(true);
  }

  /** One click: select every warm lead and open the composer over them. */
  function messageWarm() {
    if (warm.length === 0) return;
    setSelected(new Set(warm.map((r) => r.id)));
    setSendTarget({ recipients: warm.map(toRecipient) });
  }

  async function assign(row: ContactRow, employeeId: string) {
    const previous: Partial<ContactRow> = {
      assignedToId: row.assignedToId,
      assignedToName: row.assignedToName,
    };
    const target = employees.find((e) => e.id === employeeId) ?? null;

    patchRow(row.id, { assignedToId: target?.id ?? null, assignedToName: target?.name ?? null });
    try {
      await request('/api/contacts', 'PATCH', { id: row.id, assignedToId: employeeId });
      toast.success(target ? `Assigned to ${target.name}` : 'Assignment cleared');
    } catch (e) {
      patchRow(row.id, previous);
      toast.error(reason(e));
    }
  }

  async function changeStatus(row: ContactRow, next: string) {
    const previous = row.status;
    patchRow(row.id, { status: next });
    try {
      await request('/api/contacts', 'PATCH', { id: row.id, status: next });
      toast.success(`Status set to ${pretty(next)}`);
    } catch (e) {
      patchRow(row.id, { status: previous });
      toast.error(reason(e));
    }
  }

  async function callNow(row: ContactRow) {
    setDialling(row.id);
    try {
      const data = await request('/api/calls', 'POST', { contactId: row.id });
      patchRow(row.id, { status: 'calling' });
      toast.success(
        data.mock
          ? `Simulated call to ${row.name || row.phone} started — no real number was dialled`
          : `Calling ${row.name || row.phone}…`
      );
      router.refresh();
    } catch (e) {
      toast.error(reason(e));
    } finally {
      setDialling(null);
    }
  }

  function askDelete(row: ContactRow) {
    setConfirm({
      title: 'Delete contact',
      body: `${row.name || row.phone} will be removed. Past calls stay in the call log but are no longer linked to anyone. This cannot be undone.`,
      label: 'Delete contact',
      run: async () => {
        await request(`/api/contacts?id=${encodeURIComponent(row.id)}`, 'DELETE');
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        if (detailId === row.id) setDetailId(null);
        toast.success('Contact deleted');
        router.refresh();
      },
    });
  }

  async function bulkAssign(employeeId: string) {
    const target = employees.find((e) => e.id === employeeId);
    if (!target || selectedIds.length === 0) return;

    setBulkBusy(true);
    const ok = await batched(selectedIds, async (id) => {
      try {
        await request('/api/contacts', 'PATCH', { id, assignedToId: employeeId });
        patchRow(id, { assignedToId: target.id, assignedToName: target.name });
        return true;
      } catch {
        return false;
      }
    });
    setBulkBusy(false);

    if (ok === selectedIds.length) toast.success(`${ok} contacts assigned to ${target.name}`);
    else toast.warning(`${ok} of ${selectedIds.length} assigned — the rest failed`);
    setSelected(new Set());
    router.refresh();
  }

  async function bulkCampaign(campaignId: string) {
    const target = campaigns.find((c) => c.id === campaignId);
    if (!target || selectedIds.length === 0) return;

    setBulkBusy(true);
    const ok = await batched(selectedIds, async (id) => {
      try {
        await request('/api/contacts', 'PATCH', { id, campaignId });
        patchRow(id, { campaignId: target.id, campaignName: target.name });
        return true;
      } catch {
        return false;
      }
    });
    setBulkBusy(false);

    if (ok === selectedIds.length) toast.success(`${ok} contacts added to ${target.name}`);
    else toast.warning(`${ok} of ${selectedIds.length} added — the rest failed`);
    setSelected(new Set());
    router.refresh();
  }

  function askBulkDelete() {
    const ids = selectedIds;
    if (ids.length === 0) return;
    setConfirm({
      title: `Delete ${ids.length} contacts`,
      body: 'They will be removed from the CRM. Past calls stay in the call log but are no longer linked to anyone. This cannot be undone.',
      label: `Delete ${ids.length}`,
      run: async () => {
        const ok = await batched(ids, async (id) => {
          try {
            await request(`/api/contacts?id=${encodeURIComponent(id)}`, 'DELETE');
            return true;
          } catch {
            return false;
          }
        });
        setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
        setSelected(new Set());
        setDetailId(null);
        if (ok === ids.length) toast.success(`${ok} contacts deleted`);
        else toast.warning(`${ok} of ${ids.length} deleted — the rest failed`);
        router.refresh();
      },
    });
  }

  async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared immediately so picking the same file twice still fires onChange.
    e.target.value = '';
    if (!file) return;

    setParsing(true);
    try {
      const result = await parseContactFile(file);
      if (result.contacts.length === 0) {
        toast.error(`No usable phone numbers found in ${file.name}.`);
        return;
      }
      setImportCampaign('');
      setImportAssignee('');
      setPreview({ ...result, fileName: file.name });
    } catch (err) {
      toast.error(reason(err));
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (!preview) return;
    setImporting(true);
    try {
      const data = await request('/api/contacts', 'POST', {
        contacts: preview.contacts.slice(0, IMPORT_CAP),
        campaignId: importCampaign || undefined,
        assignedToId: importAssignee || undefined,
      });

      const parts = [`${data.created} added`, `${data.updated} updated`];
      if (data.skipped) parts.push(`${data.skipped} skipped`);
      toast.success(`Import complete — ${parts.join(', ')}`);

      if (data.skipped && Array.isArray(data.invalidSamples) && data.invalidSamples.length > 0) {
        toast.warning(`Unreadable numbers: ${data.invalidSamples.join(', ')}`);
      }
      setPreview(null);
      router.refresh();
    } catch (e) {
      toast.error(reason(e));
    } finally {
      setImporting(false);
    }
  }

  const extraHeaders = preview
    ? preview.headers.filter((h) => !Object.values(preview.mapping).includes(h))
    : [];

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {rows.length > 0 && (
            <div className="relative flex-1 min-w-[15rem] max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search name, phone or company…"
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={onFilePicked}
              className="hidden"
            />
            {warm.length > 0 && (
              <button
                onClick={messageWarm}
                title="Select everyone whose last call ended as interested or callback requested"
                className={secondaryClass}
              >
                <MessageCircle className="w-4 h-4" />
                Message all interested
                <span className="tabular-nums opacity-60">{warm.length}</span>
              </button>
            )}
            {/* The export mirrors what is on screen: the same status pill and
                search term are re-applied server-side, on top of the role
                scoping, so the file matches the table the user is looking at. */}
            {rows.length > 0 && (
              <ExportButton
                type="contacts"
                params={{ status, q: q.trim() }}
              />
            )}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {parsing ? 'Reading file…' : 'Import contacts'}
            </button>
          </div>
        </div>

        {rows.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <FilterPill label="All" count={rows.length} active={status === null} onClick={() => setStatus(null)} />
            {STATUSES.map((s) => (
              <FilterPill
                key={s}
                label={pretty(s)}
                count={counts[s] ?? 0}
                active={status === s}
                onClick={() => setStatus(status === s ? null : s)}
              />
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-16 text-center">
            <Users className="w-6 h-6 mx-auto text-slate-400 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No contacts yet</p>
            <p className="text-xs text-slate-500 mt-1 mb-4">
              Upload a CSV or Excel sheet — we detect the columns and show you a preview first.
            </p>
            <button
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
            >
              <Upload className="w-4 h-4" /> Import your first list
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            {filtered.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <Search className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matches</p>
                <p className="text-xs text-slate-500 mt-1">Try a different search or status.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1080px]">
                  <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                    <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="pl-4 pr-2 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allShownSelected}
                          onChange={toggleAllShown}
                          aria-label="Select all shown contacts"
                          className="w-4 h-4 rounded accent-brand-600 align-middle"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">Contact</th>
                      <th className="px-4 py-3 font-medium">Loan</th>
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-4 py-3 font-medium">Assigned to</th>
                      <th className="px-4 py-3 font-medium">Last outcome</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {filtered.map((r) => {
                      const last = r.calls[0] ?? null;
                      const busy = dialling === r.id;
                      const blocked = r.status === 'calling' || r.status === 'do_not_call';

                      return (
                        <tr
                          key={r.id}
                          className={cn(
                            'hover:bg-slate-50 dark:hover:bg-white/[0.02]',
                            selected.has(r.id) && 'bg-brand-50/60 dark:bg-brand-500/[0.06]'
                          )}
                        >
                          <td className="pl-4 pr-2 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleRow(r.id)}
                              aria-label={`Select ${r.name || r.phone}`}
                              className="w-4 h-4 rounded accent-brand-600 align-middle"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900 dark:text-white truncate max-w-[14rem]">
                              {r.name || '—'}
                            </p>
                            <p className="text-xs text-slate-500 tabular-nums">{r.phone}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-600 dark:text-slate-300 truncate max-w-[11rem]">
                              {r.loanType || '—'}
                            </p>
                            {r.loanAmount != null && (
                              <p className="text-xs text-slate-500 tabular-nums">{inr(r.loanAmount)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600 dark:text-slate-400 truncate max-w-[10rem]">
                            {r.campaignName || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={r.assignedToId ?? ''}
                              onChange={(e) => assign(r, e.target.value)}
                              aria-label={`Assign ${r.name || r.phone}`}
                              className={rowSelectClass}
                            >
                              <option value="">Unassigned</option>
                              {/* Keeps an admin-owned lead visible in a list of employees. */}
                              {r.assignedToId && !employees.some((emp) => emp.id === r.assignedToId) && (
                                <option value={r.assignedToId}>{r.assignedToName ?? 'Current owner'}</option>
                              )}
                              {employees.map((emp) => (
                                <option key={emp.id} value={emp.id}>{emp.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            {last ? (
                              <div>
                                <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', LEAD_TONE[last.leadStatus] ?? LEAD_TONE.unknown)}>
                                  {pretty(last.leadStatus)}
                                </span>
                                <p className="text-[11px] text-slate-500 mt-1">{when(last.startedAt)}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">Not called</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', TONE[r.status] ?? TONE.pending)}>
                              {pretty(r.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => callNow(r)}
                                disabled={busy || blocked}
                                title={
                                  r.status === 'do_not_call'
                                    ? 'This contact asked not to be called'
                                    : r.status === 'calling'
                                      ? 'A call is already in progress'
                                      : 'Call now'
                                }
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                              >
                                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
                                Call
                              </button>
                              <button
                                onClick={() => setSendTarget({ recipients: [toRecipient(r)] })}
                                title="Send WhatsApp"
                                aria-label={`Send WhatsApp to ${r.name || r.phone}`}
                                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDetailId(r.id)}
                                className="h-8 px-2 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                Details
                              </button>
                              <button
                                onClick={() => askDelete(r)}
                                title="Delete contact"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
        )}
      </div>

      {/* Bulk action bar */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="fixed inset-x-0 bottom-5 z-40 flex justify-center px-4 pointer-events-none"
          >
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128] shadow-xl shadow-slate-900/10 px-3 py-2.5">
              <span className="px-2 text-sm font-semibold text-slate-900 dark:text-white tabular-nums">
                {selectedIds.length} selected
              </span>

              {/* Calling is the headline action on this screen, so it takes the
                  primary button and WhatsApp steps back to the outline style. */}
              <button
                onClick={openBulkCall}
                disabled={bulkBusy || agentsLoading || dialableSelected.length === 0}
                title={bulkCallHint}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {agentsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                Call selected
                {dialableSelected.length > 0 && dialableSelected.length !== selectedIds.length && (
                  <span className="tabular-nums opacity-70">{dialableSelected.length}</span>
                )}
              </button>

              {/* A disabled button's tooltip is unreliable, and "why is this
                  greyed out?" is exactly the question here — so say it inline. */}
              {dialableSelected.length === 0 && (
                <span className="max-w-[15rem] px-1 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                  {bulkCallHint}
                </span>
              )}

              <button
                onClick={messageSelected}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                <MessageCircle className="w-4 h-4" /> Send WhatsApp
              </button>

              <select
                value=""
                disabled={bulkBusy || employees.length === 0}
                onChange={(e) => bulkAssign(e.target.value)}
                aria-label="Assign selected contacts"
                className="h-9 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">{employees.length === 0 ? 'No employees yet' : 'Assign to…'}</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>

              <select
                value=""
                disabled={bulkBusy || campaigns.length === 0}
                onChange={(e) => bulkCampaign(e.target.value)}
                aria-label="Add selected contacts to a campaign"
                className="h-9 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">{campaigns.length === 0 ? 'No campaigns yet' : 'Add to campaign…'}</option>
                {campaigns.map((camp) => (
                  <option key={camp.id} value={camp.id}>{camp.name}</option>
                ))}
              </select>

              <button
                onClick={askBulkDelete}
                disabled={bulkBusy}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>

              {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}

              <button
                onClick={() => setSelected(new Set())}
                disabled={bulkBusy}
                title="Clear selection"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import preview */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !importing && setPreview(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Review before importing</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <FileSpreadsheet className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                    {preview.fileName}
                  </p>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  disabled={importing}
                  className="p-1 -mr-1 text-slate-400 hover:text-slate-600 disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 my-5">
                <Stat label="Rows read" value={String(preview.totalRows)} />
                <Stat label="Ready to import" value={String(preview.contacts.length)} />
                <Stat label="No phone number" value={String(preview.skipped)} />
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                  Detected columns
                </h3>
                <div className="grid sm:grid-cols-2 gap-x-6">
                  {IMPORT_FIELDS.map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-3 py-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{f.label}</span>
                      <span
                        className={cn(
                          'text-xs font-medium truncate',
                          preview.mapping[f.key]
                            ? 'text-slate-800 dark:text-slate-200'
                            : 'text-slate-400 dark:text-slate-500'
                        )}
                      >
                        {preview.mapping[f.key] || 'not detected'}
                      </span>
                    </div>
                  ))}
                </div>
                {extraHeaders.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-white/5">
                    Kept as custom fields: {extraHeaders.join(', ')}
                  </p>
                )}
              </div>

              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                First {Math.min(5, preview.contacts.length)} rows
              </h3>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-x-auto mb-5">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-slate-50 dark:bg-white/5">
                    <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Phone</th>
                      <th className="px-3 py-2 font-medium">Company</th>
                      <th className="px-3 py-2 font-medium">Loan</th>
                      <th className="px-3 py-2 font-medium text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                    {preview.contacts.slice(0, 5).map((c, i) => (
                      <tr key={`${c.phone}-${i}`}>
                        <td className="px-3 py-2 text-slate-900 dark:text-white">{c.name || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300 tabular-nums">{c.phone}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.company || '—'}</td>
                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{c.loanType || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                          {c.loanAmount != null ? inr(c.loanAmount) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mb-5">
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Add every row to a campaign
                  </span>
                  <select value={importCampaign} onChange={(e) => setImportCampaign(e.target.value)} className={inputClass}>
                    <option value="">No campaign</option>
                    {campaigns.map((camp) => (
                      <option key={camp.id} value={camp.id}>{camp.name}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    Assign every row to
                  </span>
                  <select value={importAssignee} onChange={(e) => setImportAssignee(e.target.value)} className={inputClass}>
                    <option value="">Nobody yet</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              {preview.contacts.length > IMPORT_CAP && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-3.5 py-3 mb-5">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Only the first {IMPORT_CAP.toLocaleString()} rows will be imported. Split the file and
                    import the rest afterwards.
                  </p>
                </div>
              )}

              <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">
                Rows are matched on phone number — an existing contact is updated rather than duplicated.
              </p>

              <div className="flex items-center justify-end gap-2">
                <button onClick={() => setPreview(null)} disabled={importing} className={secondaryClass}>
                  Cancel
                </button>
                <button
                  onClick={runImport}
                  disabled={importing}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Import {Math.min(preview.contacts.length, IMPORT_CAP)} contacts
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Row detail */}
      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setDetailId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-[#0a1128] border-l border-slate-200 dark:border-white/10 overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate">{detail.name || detail.phone}</h2>
                  <p className="text-xs text-slate-500 tabular-nums">{detail.phone}</p>
                </div>
                <button onClick={() => setDetailId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Status" value={pretty(detail.status)} />
                  <Stat label="Attempts" value={String(detail.attempts)} />
                  <Stat label="Calls" value={String(detail.callCount)} />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => callNow(detail)}
                    disabled={dialling === detail.id || detail.status === 'calling' || detail.status === 'do_not_call'}
                    className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors"
                  >
                    {dialling === detail.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                    Call now
                  </button>
                  <button
                    onClick={() => setSendTarget({ recipients: [toRecipient(detail)] })}
                    className={secondaryClass}
                  >
                    <MessageCircle className="w-4 h-4" /> WhatsApp
                  </button>
                  <select
                    value={detail.status}
                    onChange={(e) => changeStatus(detail, e.target.value)}
                    aria-label="Change status"
                    className="h-9 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 capitalize"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{pretty(s)}</option>
                    ))}
                  </select>
                </div>

                <section>
                  <SectionTitle icon={Users}>Details</SectionTitle>
                  <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200 dark:border-white/10 px-4">
                    <Detail label="Email" value={detail.email} />
                    <Detail label="Company" value={detail.company} />
                    <Detail label="Loan type" value={detail.loanType} />
                    <Detail label="Loan amount" value={detail.loanAmount != null ? inr(detail.loanAmount) : null} />
                    <Detail label="Campaign" value={detail.campaignName} />
                    <Detail label="Assigned to" value={detail.assignedToName} />
                    <Detail label="Last attempt" value={detail.lastAttemptAt ? when(detail.lastAttemptAt) : null} />
                    <Detail label="Next attempt" value={detail.nextAttemptAt ? when(detail.nextAttemptAt) : null} />
                    <Detail label="Added" value={when(detail.createdAt)} />
                  </dl>
                </section>

                <section>
                  <SectionTitle icon={Tag}>Tags</SectionTitle>
                  {detail.tags.length === 0 ? (
                    <p className="text-xs text-slate-500">No tags.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {detail.tags.map((t) => (
                        <span key={t} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </section>

                {detail.customFields && Object.keys(detail.customFields).length > 0 && (
                  <section>
                    <SectionTitle icon={FileSpreadsheet}>From the imported sheet</SectionTitle>
                    <dl className="divide-y divide-slate-100 dark:divide-white/[0.06] rounded-xl border border-slate-200 dark:border-white/10 px-4">
                      {Object.entries(detail.customFields).map(([key, value]) => (
                        <Detail key={key} label={key} value={value == null ? null : String(value)} />
                      ))}
                    </dl>
                  </section>
                )}

                <section>
                  <SectionTitle icon={PhoneCall}>Call history</SectionTitle>
                  {detail.calls.length === 0 ? (
                    <p className="text-xs text-slate-500">This contact has not been called yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.calls.map((c) => (
                        <li key={c.id} className="rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', LEAD_TONE[c.leadStatus] ?? LEAD_TONE.unknown)}>
                              {pretty(c.leadStatus)}
                            </span>
                            <span className="text-[11px] text-slate-500 tabular-nums">
                              {duration(c.durationSec)} · {when(c.startedAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1.5 leading-relaxed">
                            {c.summary || `Call ${pretty(c.status)}.`}
                          </p>
                        </li>
                      ))}
                      {detail.callCount > detail.calls.length && (
                        <li className="text-[11px] text-slate-500 px-1">
                          Showing the {detail.calls.length} most recent of {detail.callCount} calls.
                        </li>
                      )}
                    </ul>
                  )}
                </section>

                <button
                  onClick={() => askDelete(detail)}
                  className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete contact
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Destructive confirmation */}
      <AnimatePresence>
        {confirm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !confirmBusy && setConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/10 p-6"
            >
              <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center mb-3">
                <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{confirm.title}</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{confirm.body}</p>

              <div className="flex items-center justify-end gap-2 mt-5">
                <button onClick={() => setConfirm(null)} disabled={confirmBusy} className={secondaryClass}>
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setConfirmBusy(true);
                    try {
                      await confirm.run();
                      setConfirm(null);
                    } catch (e) {
                      toast.error(reason(e));
                    } finally {
                      setConfirmBusy(false);
                    }
                  }}
                  disabled={confirmBusy}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {confirmBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  {confirm.label}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* The dialog is handed the whole selection, do-not-call rows included,
          so it can show what will be left out rather than quietly shrinking
          the count the user just chose. */}
      <BulkCallDialog
        open={bulkCallOpen}
        contacts={selectedRows.map((r) => ({
          id: r.id,
          name: r.name,
          phone: r.phone,
          status: r.status,
        }))}
        agents={agentOptions}
        onClose={() => setBulkCallOpen(false)}
        onQueued={() => setSelected(new Set())}
      />

      <SendMessageDialog
        target={sendTarget}
        onClose={() => setSendTarget(null)}
        // A one-off message leaves the selection alone; a bulk send has consumed it.
        onSent={() => {
          if ((sendTarget?.recipients.length ?? 0) > 1) setSelected(new Set());
        }}
      />
    </>
  );
}

function FilterPill({
  label, count, active, onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium capitalize transition-colors',
        active
          ? 'border-brand-500/40 bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
          : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
      )}
    >
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize truncate tabular-nums">{value}</p>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-slate-400" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</h3>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
      <dd className="text-xs font-medium text-slate-800 dark:text-slate-200 text-right break-words min-w-0">
        {value || '—'}
      </dd>
    </div>
  );
}
