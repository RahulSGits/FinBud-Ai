'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle, CalendarClock, Loader2, MessageCircle, MessageSquare, PhoneCall, Search,
  StickyNote, Trash2, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  SendMessageDialog,
  type MessageRecipient,
  type SendMessageTarget,
} from '@/components/messaging/send-message-dialog';
import { cn } from '@/lib/utils';

export interface LeadCallRow {
  id: string;
  status: string;
  leadStatus: string;
  durationSec: number;
  summary: string | null;
  transcriptText: string | null;
  startedAt: string;
}

export interface LeadRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  loanType: string | null;
  loanAmount: number | null;
  status: string;
  callCount: number;
  calls: LeadCallRow[];
}

interface NoteRow {
  id: string;
  body: string;
  callbackAt: string | null;
  createdAt: string;
  authorId: string | null;
  author: { id: string; name: string } | null;
}

interface MessageRow {
  id: string;
  body: string;
  status: string;
  error: string | null;
  templateName: string | null;
  createdAt: string;
  sentAt: string | null;
  deliveredAt: string | null;
}

interface LiveCall {
  id: string;
  status: string;
  startedAt: string;
}

const IN_FLIGHT = ['initiated', 'ringing', 'in_progress'];

const STATUS_ORDER = ['pending', 'calling', 'retry', 'completed', 'exhausted', 'do_not_call'];

const MESSAGE_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'];

const STATUS_TONE: Record<string, string> = {
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

const MESSAGE_TONE: Record<string, string> = {
  queued: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  sent: 'bg-sky-100 dark:bg-sky-500/10 text-sky-700 dark:text-sky-400',
  delivered: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  read: 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  failed: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function fmtDuration(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function relative(iso: string) {
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (mins < 0) {
    const past = Math.abs(mins);
    if (past < 60) return `${past}m ago`;
    if (past < 1440) return `${Math.floor(past / 60)}h ago`;
    return `${Math.floor(past / 1440)}d ago`;
  }
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins}m`;
  if (mins < 1440) return `in ${Math.floor(mins / 60)}h`;
  return `in ${Math.floor(mins / 1440)}d`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function iso(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') return value;
  if (value instanceof Date) return value.toISOString();
  return null;
}

function stamp(value: string): number {
  const t = Date.parse(value);
  return Number.isNaN(t) ? 0 : t;
}

function toMessages(payload: unknown): MessageRow[] {
  const box = record(payload);
  const raw: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(box.messages)
      ? box.messages
      : [];

  return raw
    .map(record)
    .filter((m) => typeof m.id === 'string')
    .map((m) => {
      const template = record(m.template);
      const status = typeof m.status === 'string' && MESSAGE_STATUSES.indexOf(m.status) !== -1
        ? m.status
        : 'queued';
      return {
        id: String(m.id),
        body: typeof m.body === 'string' ? m.body : '',
        status,
        error: typeof m.error === 'string' && m.error ? m.error : null,
        templateName: typeof template.name === 'string' ? template.name : null,
        createdAt: iso(m.createdAt) ?? new Date().toISOString(),
        sentAt: iso(m.sentAt),
        deliveredAt: iso(m.deliveredAt),
      };
    })
    .sort((a, b) => stamp(b.sentAt ?? b.createdAt) - stamp(a.sentAt ?? a.createdAt));
}

function toRecipient(lead: LeadRow): MessageRecipient {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    status: lead.status,
    // Newest call first, so this is the outcome the template is chosen for.
    leadStatus: lead.calls[0]?.leadStatus ?? null,
    company: lead.company,
    email: lead.email,
    loanType: lead.loanType,
    loanAmount: lead.loanAmount,
  };
}

export function LeadWorkspace({
  leads,
  currentUserId,
  initialLeadId = null,
}: {
  leads: LeadRow[];
  currentUserId: string;
  initialLeadId?: string | null;
}) {
  const router = useRouter();

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [openId, setOpenId] = useState<string | null>(() =>
    initialLeadId && leads.some((l) => l.id === initialLeadId) ? initialLeadId : null
  );
  const [dialling, setDialling] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, LiveCall>>({});

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [callbackAt, setCallbackAt] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [confirmNote, setConfirmNote] = useState<NoteRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [openTranscript, setOpenTranscript] = useState<string | null>(null);

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sendTarget, setSendTarget] = useState<SendMessageTarget | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const untilRef = useRef(0);
  // Last seen status per contact, so a call leaving flight can trigger one refresh.
  const seenRef = useRef<Record<string, string>>({});
  // Which lead the panel is on, so a slow message fetch cannot land on another.
  const openRef = useRef<string | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/calls?limit=50');
      if (!res.ok) return;

      const rows: any[] = await res.json();
      const next: Record<string, LiveCall> = {};
      const statuses: Record<string, string> = {};
      // Newest first, so the first row for a contact is that contact's latest call.
      for (const r of rows) {
        const contactId: string | undefined = r.contact?.id ?? r.contactId ?? undefined;
        if (!contactId || next[contactId]) continue;
        next[contactId] = { id: r.id, status: r.status, startedAt: r.startedAt };
        statuses[contactId] = r.status;
      }

      const settled = Object.entries(seenRef.current).some(
        ([id, was]) => IN_FLIGHT.includes(was) && !IN_FLIGHT.includes(statuses[id] ?? 'completed')
      );
      seenRef.current = statuses;
      setLive(next);

      // Outcome, duration, summary and transcript are rendered from server data,
      // so a finished call needs a refresh rather than another fetch here.
      if (settled) router.refresh();
    } catch {
      // Ignore: the next tick retries.
    }
  }, [router]);

  const startPolling = useCallback(() => {
    // Two minutes covers a typical qualification call; after that the next page
    // load is soon enough and we stop hitting the API from an idle tab.
    untilRef.current = Date.now() + 2 * 60 * 1000;
    void poll();
    if (pollRef.current) return;
    pollRef.current = setInterval(() => {
      if (Date.now() > untilRef.current) {
        stopPolling();
        return;
      }
      void poll();
    }, 4000);
  }, [poll, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // The confirmation sits on top of the panel, so it closes first.
      if (confirmNote) setConfirmNote(null);
      else setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, confirmNote]);

  useEffect(() => {
    if (!openId) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotesLoading(true);
    setDraft('');
    setCallbackAt('');
    setOpenTranscript(null);

    (async () => {
      try {
        const res = await fetch(`/api/notes?contactId=${encodeURIComponent(openId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not load notes');
        if (!cancelled) setNotes(data as NoteRow[]);
      } catch (e) {
        if (!cancelled) {
          setNotes([]);
          toast.error((e as Error).message);
        }
      } finally {
        if (!cancelled) setNotesLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [openId]);

  const loadMessages = useCallback(async (contactId: string) => {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/messages?contactId=${encodeURIComponent(contactId)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const message = typeof record(data).error === 'string' ? String(record(data).error) : null;
        throw new Error(message || 'Could not load messages');
      }
      // The panel may have moved on while this was in flight.
      if (openRef.current !== contactId) return;
      setMessages(toMessages(data));
    } catch (e) {
      if (openRef.current !== contactId) return;
      setMessages([]);
      toast.error((e as Error).message);
    } finally {
      if (openRef.current === contactId) setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    openRef.current = openId;
    if (!openId) {
      setMessages([]);
      return;
    }
    void loadMessages(openId);
  }, [openId, loadMessages]);

  const statusOf = useCallback(
    (lead: LeadRow) => (IN_FLIGHT.includes(live[lead.id]?.status ?? '') ? 'calling' : lead.status),
    [live]
  );

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of leads) {
      const s = IN_FLIGHT.includes(live[l.id]?.status ?? '') ? 'calling' : l.status;
      m[s] = (m[s] ?? 0) + 1;
    }
    return m;
  }, [leads, live]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return leads.filter((l) => {
      const s = IN_FLIGHT.includes(live[l.id]?.status ?? '') ? 'calling' : l.status;
      if (statusFilter !== 'all' && s !== statusFilter) return false;
      if (!t) return true;
      return (
        (l.name ?? '').toLowerCase().includes(t) ||
        l.phone.toLowerCase().includes(t) ||
        (l.email ?? '').toLowerCase().includes(t) ||
        (l.company ?? '').toLowerCase().includes(t) ||
        (l.loanType ?? '').toLowerCase().includes(t)
      );
    });
  }, [leads, live, q, statusFilter]);

  const open = openId ? leads.find((l) => l.id === openId) ?? null : null;
  const openLive = open && IN_FLIGHT.includes(live[open.id]?.status ?? '') ? live[open.id] : null;

  async function callNow(lead: LeadRow) {
    setDialling(lead.id);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: lead.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not place the call');

      const status = String(data.status ?? 'initiated');
      setLive((m) => ({
        ...m,
        [lead.id]: { id: String(data.callId), status, startedAt: new Date().toISOString() },
      }));
      seenRef.current = { ...seenRef.current, [lead.id]: status };

      const who = lead.name || lead.phone;
      toast.success(data.mock ? `Calling ${who} — simulated` : `Calling ${who}…`);
      startPolling();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDialling(null);
    }
  }

  async function addNote() {
    if (!openId) return;
    const text = draft.trim();
    if (!text) {
      toast.error('Write something first');
      return;
    }

    let callbackIso: string | null = null;
    if (callbackAt) {
      const when = new Date(callbackAt);
      if (Number.isNaN(when.getTime())) {
        toast.error('That callback time is not valid');
        return;
      }
      if (when.getTime() < Date.now()) {
        toast.error('Pick a callback time in the future');
        return;
      }
      // datetime-local is timezone-free; send an instant the server cannot misread.
      callbackIso = when.toISOString();
    }

    setSavingNote(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId: openId, body: text, callbackAt: callbackIso }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not save the note');

      setNotes((n) => [data as NoteRow, ...n]);
      setDraft('');
      setCallbackAt('');
      toast.success(callbackIso ? 'Note saved and callback booked' : 'Note saved');
      // Keeps the dashboard's callback list and count honest.
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSavingNote(false);
    }
  }

  async function deleteNote(note: NoteRow) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes?id=${encodeURIComponent(note.id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not delete the note');

      setNotes((n) => n.filter((x) => x.id !== note.id));
      setConfirmNote(null);
      toast.success('Note deleted');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone, email or loan type…"
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['all', ...STATUS_ORDER.filter((s) => counts[s])].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={cn(
                'h-9 px-3 rounded-xl border text-sm font-medium transition-colors capitalize',
                statusFilter === s
                  ? 'border-brand-500/40 bg-brand-500/10 text-brand-700 dark:text-brand-400'
                  : 'border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
              )}
            >
              {s === 'all' ? 'All' : s.replace(/_/g, ' ')}
              <span className="ml-1.5 text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {s === 'all' ? leads.length : counts[s]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Search className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matching leads</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search or clear the status filter.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Loan</th>
                  <th className="px-4 py-3 font-medium text-right">Calls</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {filtered.map((lead) => {
                  const status = statusOf(lead);
                  const inFlight = live[lead.id] && IN_FLIGHT.includes(live[lead.id].status);
                  const blocked =
                    status === 'calling'
                      ? 'A call to this lead is already in progress'
                      : status === 'do_not_call'
                        ? 'This lead asked not to be called again'
                        : null;

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => setOpenId(lead.id)}
                      className="hover:bg-slate-50 dark:hover:bg-white/[0.02] cursor-pointer"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{lead.name || lead.phone}</p>
                        <p className="text-xs text-slate-500 tabular-nums">{lead.phone}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {lead.loanType || '—'}
                        {lead.loanAmount ? (
                          <span className="block text-xs text-slate-500 tabular-nums">
                            {money.format(lead.loanAmount)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {lead.callCount}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_TONE[status] ?? STATUS_TONE.pending)}>
                          {(inFlight ? live[lead.id].status : status).replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); void callNow(lead); }}
                          disabled={!!blocked || dialling === lead.id}
                          title={blocked ?? 'Call this lead now'}
                          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white text-xs font-semibold transition-colors"
                        >
                          {dialling === lead.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PhoneCall className="w-3.5 h-3.5" />}
                          Call now
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpenId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-[#0a1128] border-l border-slate-200 dark:border-white/10 overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate">{open.name || open.phone}</h2>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {open.phone}
                    {open.email ? ` · ${open.email}` : ''}
                  </p>
                </div>
                <button onClick={() => setOpenId(null)} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Status" value={statusOf(open).replace(/_/g, ' ')} />
                  <Stat label="Calls" value={String(open.callCount)} />
                  <Stat label="Loan" value={open.loanType || (open.loanAmount ? money.format(open.loanAmount) : '—')} />
                </div>

                {(() => {
                  const status = statusOf(open);
                  const blocked =
                    status === 'calling'
                      ? 'A call to this lead is already in progress.'
                      : status === 'do_not_call'
                        ? 'This lead asked not to be called again.'
                        : null;

                  return (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => void callNow(open)}
                          disabled={!!blocked || dialling === open.id}
                          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:hover:bg-brand-600 text-white text-sm font-semibold transition-colors"
                        >
                          {dialling === open.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
                          Call now
                        </button>
                        <button
                          onClick={() => setSendTarget({ recipients: [toRecipient(open)] })}
                          className="inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                        >
                          <MessageCircle className="w-4 h-4" />
                          WhatsApp
                        </button>
                      </div>
                      {blocked && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">{blocked}</p>
                      )}
                      {openLive && (
                        <div className="flex items-center gap-2.5 rounded-xl bg-amber-500/10 px-3.5 py-2.5">
                          <span className="relative flex w-2 h-2 shrink-0">
                            <span className="absolute inline-flex w-full h-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                            <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-500" />
                          </span>
                          <p className="text-xs text-amber-700 dark:text-amber-300 capitalize">
                            {openLive.status.replace(/_/g, ' ')} — the outcome appears below when the call ends.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <section>
                  <SectionTitle icon={StickyNote} title="Notes & callbacks" />

                  <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 space-y-3">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={3}
                      placeholder="What did you agree with this lead?"
                      className="w-full rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                    />
                    <label className="block">
                      <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                        Remind me to call back at <span className="text-slate-400 font-normal">(optional)</span>
                      </span>
                      <input
                        type="datetime-local"
                        value={callbackAt}
                        onChange={(e) => setCallbackAt(e.target.value)}
                        className="w-full h-10 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </label>
                    <div className="flex items-center justify-between gap-3">
                      {callbackAt ? (
                        <button
                          onClick={() => setCallbackAt('')}
                          className="text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        >
                          Clear reminder
                        </button>
                      ) : <span />}
                      <button
                        onClick={() => void addNote()}
                        disabled={savingNote}
                        className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                      >
                        {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
                        Save note
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    {notesLoading ? (
                      <div className="flex items-center gap-2 px-1 py-3 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading notes…
                      </div>
                    ) : notes.length === 0 ? (
                      <p className="px-1 py-3 text-xs text-slate-500 dark:text-slate-400">
                        No notes yet. The first one you write shows up here.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {notes.map((n) => (
                          <li key={n.id} className="rounded-xl bg-slate-50 dark:bg-white/5 px-3.5 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words">{n.body}</p>
                              {n.authorId === currentUserId && (
                                <button
                                  onClick={() => setConfirmNote(n)}
                                  title="Delete this note"
                                  aria-label="Delete this note"
                                  className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {n.author?.name ?? 'Someone'} · {fmtWhen(n.createdAt)}
                              </span>
                              {n.callbackAt && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                                  <CalendarClock className="w-3 h-3" />
                                  Callback {relative(n.callbackAt)}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>

                <section>
                  <SectionTitle icon={MessageCircle} title="WhatsApp messages" />
                  {messagesLoading ? (
                    <div className="flex items-center gap-2 px-1 py-3 text-xs text-slate-500">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading messages…
                    </div>
                  ) : messages.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-slate-500 dark:text-slate-400">
                      Nothing sent yet. Use WhatsApp above and every message shows here with its
                      delivery status.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {messages.map((m) => (
                        <li key={m.id} className="rounded-xl border border-slate-200 dark:border-white/10 px-3.5 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', MESSAGE_TONE[m.status] ?? MESSAGE_TONE.queued)}>
                              {m.status}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {fmtWhen(m.sentAt ?? m.createdAt)}
                              {m.deliveredAt ? ` · delivered ${fmtWhen(m.deliveredAt)}` : ''}
                            </span>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words mt-2">
                            {m.body}
                          </p>
                          {m.templateName && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                              From “{m.templateName}”
                            </p>
                          )}
                          {m.error && (
                            <p className="text-[11px] text-red-600 dark:text-red-400 mt-1.5">{m.error}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <SectionTitle icon={MessageSquare} title="Call history" />
                  {open.calls.length === 0 ? (
                    <p className="px-1 py-3 text-xs text-slate-500 dark:text-slate-400">
                      This lead has not been called yet.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {open.calls.map((c) => (
                        <li key={c.id} className="rounded-xl border border-slate-200 dark:border-white/10 p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', LEAD_TONE[c.leadStatus] ?? LEAD_TONE.unknown)}>
                                {c.leadStatus.replace(/_/g, ' ')}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                                {c.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {fmtDuration(c.durationSec)} · {fmtWhen(c.startedAt)}
                            </span>
                          </div>

                          {c.summary && (
                            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-2.5">{c.summary}</p>
                          )}

                          {c.transcriptText && (
                            <>
                              <button
                                onClick={() => setOpenTranscript((t) => (t === c.id ? null : c.id))}
                                className="mt-2.5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
                              >
                                {openTranscript === c.id ? 'Hide transcript' : 'Show transcript'}
                              </button>
                              {openTranscript === c.id && (
                                <div className="mt-2.5 space-y-2">
                                  {c.transcriptText.split('\n').map((line, i) => {
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
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmNote && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !deleting && setConfirmNote(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a1128] p-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 shrink-0 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Delete this note?</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-3">{confirmNote.body}</p>
                  {confirmNote.callbackAt && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                      The callback reminder goes with it.
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 mt-5">
                <button
                  onClick={() => setConfirmNote(null)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void deleteNote(confirmNote)}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SendMessageDialog
        target={sendTarget}
        onClose={() => setSendTarget(null)}
        // The new message has to show up in the history right underneath it.
        onSent={() => {
          if (openRef.current) void loadMessages(openRef.current);
        }}
      />
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

function SectionTitle({ icon: Icon, title }: { icon: any; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="w-4 h-4 text-slate-400" />
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
    </div>
  );
}
