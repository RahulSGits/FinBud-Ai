'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  CalendarClock,
  ChevronRight,
  Clock,
  FileText,
  MessageSquare,
  Percent,
  PhoneCall,
  PhoneOutgoing,
  Search,
  Target,
  Timer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import { OutcomeDonut } from '@/components/analytics/charts';
import { CampaignControls } from './campaign-controls';
import { CampaignForm, type CampaignAgentOption } from './campaign-form';
import { describeWindow, parseBusinessHours } from '@/lib/campaigns/business-hours';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shapes crossing the server/client boundary — every Date is already an ISO
// string by the time it reaches here.
// ---------------------------------------------------------------------------

export interface CampaignCallRow {
  id: string;
  status: string;
  leadStatus: string;
  interested: boolean;
  durationSec: number;
  summary: string | null;
  transcriptText: string | null;
  failureReason: string | null;
  customerIntent: string | null;
  nextAction: string | null;
  objections: string | null;
  leadScore: number | null;
  agentName: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface CampaignContactRow {
  id: string;
  name: string | null;
  phone: string;
  email: string | null;
  company: string | null;
  loanType: string | null;
  loanAmount: number | null;
  status: string;
  attempts: number;
  lastAttemptAt: string | null;
  nextAttemptAt: string | null;
  assignedToName: string | null;
  createdAt: string;
  /** Newest first. */
  calls: CampaignCallRow[];
}

export interface CampaignSummary {
  id: string;
  name: string;
  status: string;
  agentId: string;
  agentName: string;
  agentIsActive: boolean;
  createdByName: string | null;
  concurrency: number;
  dailyCallLimit: number | null;
  retryLimit: number;
  retryDelayMins: number;
  /** Raw column JSON — handed straight back to the edit form. */
  businessHours: unknown;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Props {
  campaign: CampaignSummary;
  contacts: CampaignContactRow[];
  /** Agents the viewer may switch this campaign to. Scoped by the server page. */
  agents: CampaignAgentOption[];
  unassignedCount: number;
  canControl: boolean;
  canEdit: boolean;
  audience?: 'all' | 'mine';
  basePath?: '/admin' | '/dashboard';
  ownerId?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IN_FLIGHT = new Set(['initiated', 'ringing', 'in_progress']);
const QUEUED = new Set(['pending', 'retry', 'calling']);

const CONTACT_ORDER = ['pending', 'calling', 'retry', 'completed', 'exhausted', 'do_not_call'];

const CONTACT_TONE: Record<string, string> = {
  pending: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  calling: 'bg-blue-100 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400',
  retry: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  completed: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  exhausted: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  do_not_call: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

// Same tone map as the calls screen, so an outcome badge means the same thing
// wherever it is seen.
const LEAD_TONE: Record<string, string> = {
  interested: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  callback_requested: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  not_interested: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  no_answer: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  voicemail: 'bg-slate-100 dark:bg-white/5 text-slate-500',
  unknown: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

const LEAD_ORDER: LeadStatus[] = [
  'interested',
  'callback_requested',
  'not_interested',
  'no_answer',
  'voicemail',
  'unknown',
];

const INPUT =
  'h-10 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500';

// Fixed locale on both sides of hydration: an Indian deployment renders
// "1,00,000" where the server's default locale would render "100,000".
const NUMBER = new Intl.NumberFormat('en-IN');

function num(value: number): string {
  return NUMBER.format(value);
}

function label(raw: string): string {
  return raw.replace(/_/g, ' ');
}

function duration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours) return `${hours}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Timestamps are pinned to the campaign's own calling timezone rather than the
 * viewer's: it keeps server and browser rendering identical (no hydration
 * mismatch) and it is the clock the campaign actually dials by.
 */
function makeFormatter(tz: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: tz });
  } catch {
    // A hand-edited timezone string should not take the page down.
    return new Intl.DateTimeFormat('en-IN', options);
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CampaignDetail({
  campaign,
  contacts,
  agents,
  unassignedCount,
  canControl,
  canEdit,
  audience = 'all',
  basePath = '/admin',
  ownerId,
}: Props) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  // The panel holds an id, not a row: a refresh while a campaign is running
  // replaces every row object, and a snapshot would freeze mid-call.
  const [openId, setOpenId] = useState<string | null>(null);

  const hours = useMemo(() => parseBusinessHours(campaign.businessHours), [campaign.businessHours]);
  const fmt = useMemo(() => makeFormatter(hours?.tz ?? 'Asia/Kolkata'), [hours]);

  const when = (iso: string | null): string => (iso ? fmt.format(new Date(iso)) : '—');

  const stats = useMemo(() => {
    let dialled = 0;
    let connected = 0;
    let interested = 0;
    let remaining = 0;
    let liveCalls = 0;
    let calls = 0;
    let connectedCalls = 0;
    let talkTimeSec = 0;

    const outcomeTotals: Record<string, number> = {};

    for (const contact of contacts) {
      if (QUEUED.has(contact.status)) remaining += 1;
      if (contact.attempts > 0 || contact.calls.length > 0) dialled += 1;

      let reached = false;
      let keen = false;

      for (const call of contact.calls) {
        calls += 1;
        if (IN_FLIGHT.has(call.status)) liveCalls += 1;
        outcomeTotals[call.leadStatus] = (outcomeTotals[call.leadStatus] ?? 0) + 1;
        // Airtime is the only honest proof a human picked up.
        if (call.durationSec > 0) {
          reached = true;
          connectedCalls += 1;
          talkTimeSec += call.durationSec;
        }
        if (call.interested) keen = true;
      }

      if (reached) connected += 1;
      if (keen) interested += 1;
    }

    const total = contacts.length;
    const processed = Math.max(0, total - remaining);

    return {
      total,
      dialled,
      connected,
      interested,
      remaining,
      liveCalls,
      calls,
      processed,
      progress: pct(processed, total),
      connectRate: pct(connected, dialled),
      interestRate: pct(interested, connected),
      avgDurationSec: connectedCalls ? Math.round(talkTimeSec / connectedCalls) : 0,
      talkTimeSec,
      outcomeTotals,
    };
  }, [contacts]);

  const outcomes = useMemo(
    () =>
      LEAD_ORDER.map((status) => ({ status, count: stats.outcomeTotals[status] ?? 0 })).sort(
        (a, b) => b.count - a.count
      ),
    [stats.outcomeTotals]
  );

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const contact of contacts) counts[contact.status] = (counts[contact.status] ?? 0) + 1;
    return counts;
  }, [contacts]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();

    const filtered = contacts.filter((contact) => {
      if (statusFilter !== 'all' && contact.status !== statusFilter) return false;
      if (outcomeFilter !== 'all' && !contact.calls.some((c) => c.leadStatus === outcomeFilter)) {
        return false;
      }
      if (!term) return true;
      return (
        (contact.name ?? '').toLowerCase().includes(term) ||
        contact.phone.toLowerCase().includes(term) ||
        (contact.company ?? '').toLowerCase().includes(term) ||
        (contact.email ?? '').toLowerCase().includes(term) ||
        (contact.calls[0]?.summary ?? '').toLowerCase().includes(term)
      );
    });

    // Most recently worked first; never-attempted rows fall to the bottom.
    return filtered.sort((a, b) => {
      const left = a.lastAttemptAt ? Date.parse(a.lastAttemptAt) : 0;
      const right = b.lastAttemptAt ? Date.parse(b.lastAttemptAt) : 0;
      if (left !== right) return right - left;
      return (a.name ?? a.phone).localeCompare(b.name ?? b.phone);
    });
  }, [contacts, query, statusFilter, outcomeFilter]);

  const open = openId ? contacts.find((c) => c.id === openId) ?? null : null;

  const cards = [
    {
      label: 'Contacts',
      value: num(stats.total),
      hint: `${num(stats.calls)} call${stats.calls === 1 ? '' : 's'} placed`,
      icon: Users,
      tone: 'text-sky-500 bg-sky-500/10',
    },
    {
      label: 'Dialled',
      value: num(stats.dialled),
      hint: 'contacts attempted at least once',
      icon: PhoneOutgoing,
      tone: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Connected',
      value: num(stats.connected),
      hint: 'reached a person',
      icon: PhoneCall,
      tone: 'text-brand-500 bg-brand-500/10',
    },
    {
      label: 'Interested',
      value: num(stats.interested),
      hint: 'said yes on at least one call',
      icon: Target,
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Remaining',
      value: num(stats.remaining),
      hint: 'still queued to dial',
      icon: Clock,
      tone: 'text-amber-500 bg-amber-500/10',
    },
    {
      label: 'Connect rate',
      value: `${stats.connectRate}%`,
      hint: 'of the contacts dialled',
      icon: TrendingUp,
      tone: 'text-brand-500 bg-brand-500/10',
    },
    {
      label: 'Interest rate',
      value: `${stats.interestRate}%`,
      hint: 'of the contacts connected',
      icon: Percent,
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Avg duration',
      value: duration(stats.avgDurationSec),
      hint: `${duration(stats.talkTimeSec)} of talk time`,
      icon: Timer,
      tone: 'text-purple-500 bg-purple-500/10',
    },
  ];

  const editForm = canEdit ? (
    <CampaignForm
      agents={agents}
      unassignedCount={unassignedCount}
      audience={audience}
      basePath={basePath}
      ownerId={ownerId}
      campaign={{
        id: campaign.id,
        name: campaign.name,
        agentId: campaign.agentId,
        concurrency: campaign.concurrency,
        dailyCallLimit: campaign.dailyCallLimit,
        retryLimit: campaign.retryLimit,
        retryDelayMins: campaign.retryDelayMins,
        businessHours: campaign.businessHours,
        scheduledAt: campaign.scheduledAt,
      }}
    />
  ) : null;

  return (
    <>
      {/* 1 — Setup, controls and progress */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
              <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              {campaign.agentName}
              {!campaign.agentIsActive && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  Agent is a draft
                </span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                Calls {describeWindow(hours)}
              </span>
              <span className="tabular-nums">
                concurrency {campaign.concurrency}
                {campaign.dailyCallLimit ? ` · ${num(campaign.dailyCallLimit)}/day` : ''}
              </span>
              <span className="tabular-nums">
                {campaign.retryLimit} retr{campaign.retryLimit === 1 ? 'y' : 'ies'} · {campaign.retryDelayMins}m apart
              </span>
              {campaign.scheduledAt && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="w-3.5 h-3.5" />
                  Held until {when(campaign.scheduledAt)}
                </span>
              )}
              {campaign.startedAt && <span>Started {when(campaign.startedAt)}</span>}
              {campaign.completedAt && <span>Finished {when(campaign.completedAt)}</span>}
              {campaign.createdByName && <span>Created by {campaign.createdByName}</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <CampaignControls
              campaignId={campaign.id}
              status={campaign.status}
              liveCalls={stats.liveCalls}
              remaining={stats.remaining}
              canControl={canControl}
            />
            {editForm}
          </div>
        </div>

        <div className="mt-5">
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-2.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="tabular-nums">
              {num(stats.processed)}/{num(stats.total)} processed ({stats.progress}%)
            </span>
            <span className="tabular-nums">{num(stats.remaining)} remaining</span>
            <span className="tabular-nums text-brand-600 dark:text-brand-400">
              {num(stats.interested)} interested
            </span>
          </div>
        </div>
      </section>

      {/* 2 — Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4"
          >
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', card.tone)}>
              <card.icon className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{card.value}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{card.label}</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">{card.hint}</div>
          </div>
        ))}
      </div>

      {/* 3 — Outcome breakdown */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Outcome breakdown</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              How every call this campaign placed was classified
            </p>
          </div>
        </header>
        <div className="p-5">
          <OutcomeDonut outcomes={outcomes} />
        </div>
      </section>

      {/* 4 — Contacts */}
      <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
        <header className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Contacts</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {rows.length === contacts.length
                  ? `${num(contacts.length)} in this campaign`
                  : `${num(rows.length)} of ${num(contacts.length)} shown`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search name, phone or summary…"
                  aria-label="Search contacts"
                  className={cn(INPUT, 'w-56 sm:w-72 pl-9')}
                />
              </div>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                aria-label="Filter by call outcome"
                className={cn(INPUT, 'w-44')}
              >
                <option value="all">Any outcome</option>
                {LEAD_ORDER.filter((status) => (stats.outcomeTotals[status] ?? 0) > 0).map((status) => (
                  <option key={status} value={status}>
                    {label(status)} ({stats.outcomeTotals[status]})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 mt-3">
            <FilterChip
              active={statusFilter === 'all'}
              onClick={() => setStatusFilter('all')}
              label="All"
              count={contacts.length}
            />
            {CONTACT_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0).map((status) => (
              <FilterChip
                key={status}
                active={statusFilter === status}
                onClick={() => setStatusFilter(status)}
                label={label(status)}
                count={statusCounts[status] ?? 0}
              />
            ))}
          </div>
        </header>

        {contacts.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Users className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No contacts in this campaign</p>
            <p className="text-xs text-slate-500 mt-1">
              Import a list or attach existing leads from the edit dialog, then start calling.
            </p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Search className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No matches</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search or clear the filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[940px]">
              <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                  <th scope="col" className="px-4 py-3 font-medium">Contact</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium">Outcome</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Attempts</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right">Duration</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right whitespace-nowrap">Last attempt</th>
                  <th scope="col" className="px-4 py-3 font-medium">Summary</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {rows.map((contact) => {
                  const latest = contact.calls[0] ?? null;
                  return (
                    <tr
                      key={contact.id}
                      tabIndex={0}
                      onClick={() => setOpenId(contact.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setOpenId(contact.id);
                        }
                      }}
                      className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500"
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{contact.name || contact.phone}</p>
                        <p className="text-xs text-slate-500 tabular-nums">
                          {contact.name ? contact.phone : contact.company || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'px-2 py-0.5 rounded-full text-[11px] font-medium capitalize',
                            CONTACT_TONE[contact.status] ?? CONTACT_TONE.pending
                          )}
                        >
                          {label(contact.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {latest ? (
                          <span
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[11px] font-medium capitalize',
                              LEAD_TONE[latest.leadStatus] ?? LEAD_TONE.unknown
                            )}
                          >
                            {label(latest.leadStatus)}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">Not called</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {contact.attempts}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {latest ? duration(latest.durationSec) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 whitespace-nowrap">
                        {when(contact.lastAttemptAt)}
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {latest?.summary || latest?.failureReason || '—'}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ChevronRight className="w-4 h-4 inline-block text-slate-400" aria-hidden />
                        <span className="sr-only">Open {contact.name || contact.phone}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Contact side panel — full call history and transcripts */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setOpenId(null)}
          >
            <motion.aside
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute right-0 top-0 bottom-0 w-full max-w-lg bg-white dark:bg-[#0a1128] border-l border-slate-200 dark:border-white/10 overflow-y-auto"
            >
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-200 dark:border-white/10 bg-white/90 dark:bg-[#0a1128]/90 backdrop-blur">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-900 dark:text-white truncate">
                    {open.name || open.phone}
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums">{open.phone}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Close"
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="Status" value={label(open.status)} />
                  <Stat label="Attempts" value={String(open.attempts)} />
                  <Stat label="Last attempt" value={when(open.lastAttemptAt)} />
                </div>

                <Section icon={Users} title="Lead">
                  <dl className="space-y-1.5 text-sm">
                    <Detail term="Company" value={open.company} />
                    <Detail term="Email" value={open.email} />
                    <Detail term="Loan" value={open.loanType} />
                    <Detail
                      term="Amount"
                      value={open.loanAmount != null ? `₹${num(open.loanAmount)}` : null}
                    />
                    <Detail term="Owner" value={open.assignedToName} />
                    <Detail
                      term="Next attempt"
                      value={open.nextAttemptAt ? when(open.nextAttemptAt) : null}
                    />
                  </dl>
                </Section>

                <Section icon={PhoneCall} title={`Call history (${open.calls.length})`}>
                  {open.calls.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Not called yet</p>
                      <p className="text-xs text-slate-500 mt-1">
                        This contact is still waiting in the queue.
                      </p>
                    </div>
                  ) : (
                    <ol className="space-y-4">
                      {open.calls.map((call, index) => (
                        <li
                          key={call.id}
                          className="rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
                                #{open.calls.length - index}
                              </span>
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[11px] font-medium capitalize',
                                  LEAD_TONE[call.leadStatus] ?? LEAD_TONE.unknown
                                )}
                              >
                                {label(call.leadStatus)}
                              </span>
                              <span className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                                {label(call.status)}
                              </span>
                            </div>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {when(call.startedAt)} · {duration(call.durationSec)}
                            </span>
                          </div>

                          {call.agentName && (
                            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <Bot className="w-3.5 h-3.5" /> {call.agentName}
                            </p>
                          )}

                          {call.failureReason && (
                            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{call.failureReason}</p>
                          )}

                          {call.summary && (
                            <div className="mt-3">
                              <div className="flex items-center gap-2 mb-1.5">
                                <FileText className="w-3.5 h-3.5 text-slate-400" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Summary
                                </h4>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                                {call.summary}
                              </p>
                            </div>
                          )}

                          {(call.customerIntent || call.nextAction || call.objections || call.leadScore != null) && (
                            <dl className="mt-3 space-y-1.5 text-sm">
                              <Detail term="Intent" value={call.customerIntent} />
                              <Detail term="Next action" value={call.nextAction} />
                              <Detail term="Objections" value={call.objections} />
                              <Detail
                                term="Lead score"
                                value={call.leadScore != null ? `${call.leadScore}/100` : null}
                              />
                            </dl>
                          )}

                          {call.transcriptText && (
                            <div className="mt-3">
                              <div className="flex items-center gap-2 mb-2">
                                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                  Transcript
                                </h4>
                              </div>
                              <div className="space-y-2">
                                {call.transcriptText.split('\n').map((line, i) => {
                                  const isCustomer = line.startsWith('Customer:');
                                  return (
                                    <div key={i} className={cn('flex', isCustomer ? 'justify-start' : 'justify-end')}>
                                      <div
                                        className={cn(
                                          'max-w-[80%] px-3 py-2 rounded-2xl text-sm',
                                          isCustomer
                                            ? 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200 rounded-tl-sm'
                                            : 'bg-brand-500/10 text-brand-800 dark:text-brand-200 rounded-tr-sm'
                                        )}
                                      >
                                        {line.replace(/^(Customer|Agent):\s*/, '')}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </Section>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  label: text,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-7 px-2.5 rounded-lg text-xs font-medium capitalize transition-colors',
        active
          ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
      )}
    >
      {text} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}

function Stat({ label: text, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-white/5 px-3 py-2.5">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{text}</p>
      <p className="text-sm font-semibold text-slate-900 dark:text-white capitalize truncate">{value}</p>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Users;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-slate-400" />
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {title}
        </h3>
      </div>
      {children}
    </div>
  );
}

/** Skipped entirely when empty, so the panel never shows a column of dashes. */
function Detail({ term, value }: { term: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">{term}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">{value}</dd>
    </div>
  );
}
