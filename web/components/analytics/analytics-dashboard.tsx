'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  ChevronRight,
  Clock,
  Loader2,
  PhoneCall,
  PieChart as PieChartIcon,
  RefreshCw,
  Search,
  Target,
  Timer,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import type { AgentStat, AnalyticsPayload, AnalyticsTotals, EmployeeStat } from '@/lib/analytics';
// Charts load on demand; the helpers do not need recharts and load eagerly.
import {
  AgentOutcomeChart,
  DailyTrendChart,
  EmployeeComparisonChart,
  OutcomeDonut,
} from './charts-lazy';
import {
  OUTCOME_COLOUR,
  OUTCOME_ORDER,
  type OutcomeStatus,
  formatDuration,
  outcomeLabel,
} from './chart-utils';
import { cn } from '@/lib/utils';

// Declared here rather than imported from lib/analytics: that module imports the
// Prisma client, and a *value* import would drag it into the browser bundle.
// Only its types cross this boundary.
const RANGES = [7, 30, 90] as const;

// Fixed locale on both sides of hydration. `toLocaleString()` would use the
// server's locale during SSR and the browser's afterwards, which for an Indian
// deployment is the difference between "1,00,000" and "100,000".
const NUMBER = new Intl.NumberFormat('en-IN');
const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function num(value: number): string {
  return NUMBER.format(value);
}

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'never';

  const mins = Math.floor((Date.now() - then) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return DATE.format(then);
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

type EmployeeSortKey =
  | 'name'
  | 'calls'
  | 'connectRate'
  | 'interestRate'
  | 'avgDurationSec'
  | 'totalTalkTimeSec'
  | 'leadsAssigned'
  | 'callbacksBooked'
  | 'lastLoginAt';

type AgentSortKey = 'name' | 'calls' | 'connectRate' | 'interestRate' | 'avgDurationSec';

interface Sort<K extends string> {
  key: K;
  dir: 'asc' | 'desc';
}

function compareEmployees(a: EmployeeStat, b: EmployeeStat, key: EmployeeSortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name);
  if (key === 'lastLoginAt') {
    // Never-logged-in sorts as the oldest possible moment rather than as NaN.
    const left = a.lastLoginAt ? Date.parse(a.lastLoginAt) : 0;
    const right = b.lastLoginAt ? Date.parse(b.lastLoginAt) : 0;
    return left - right;
  }
  return a[key] - b[key];
}

function compareAgents(a: AgentStat, b: AgentStat, key: AgentSortKey): number {
  if (key === 'name') return a.name.localeCompare(b.name);
  return a[key] - b[key];
}

/**
 * Toggle direction when the same column is clicked again, otherwise adopt the
 * sensible default for the new column: names read best A→Z, every number reads
 * best largest first.
 */
function nextSort<K extends string>(current: Sort<K>, key: K): Sort<K> {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: key === 'name' ? 'asc' : 'desc' };
}

function SortHeader<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'right',
  className,
}: {
  label: string;
  sortKey: K;
  sort: Sort<K>;
  onSort: (key: K) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const active = sort.key === sortKey;

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-3 font-medium whitespace-nowrap', align === 'right' && 'text-right', className)}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 rounded transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
          active
            ? 'text-slate-900 dark:text-white'
            : 'hover:text-slate-700 dark:hover:text-slate-200'
        )}
      >
        {label}
        {active ? (
          sort.dir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
        ) : (
          <ArrowUpDown className="w-3 h-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Cells and shells
// ---------------------------------------------------------------------------

/** A rate reads as a number in isolation; the bar makes rows comparable at a glance. */
function RateCell({ value, tone }: { value: number; tone: 'brand' | 'emerald' }) {
  return (
    <td className="px-4 py-3">
      <div className="flex items-center justify-end gap-2.5">
        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-white/5 overflow-hidden">
          <div
            className={cn('h-full rounded-full', tone === 'brand' ? 'bg-brand-500' : 'bg-emerald-500')}
            style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
          />
        </div>
        <span className="w-11 text-right tabular-nums text-slate-700 dark:text-slate-200">{value}%</span>
      </div>
    </td>
  );
}

function OutcomeMix({
  outcomes,
  focus,
  onFocus,
}: {
  outcomes: AgentStat['outcomes'];
  focus: OutcomeStatus | null;
  onFocus: (status: OutcomeStatus) => void;
}) {
  const entries = OUTCOME_ORDER.map((status) => ({ status, count: outcomes[status] ?? 0 })).filter(
    (entry) => entry.count > 0
  );
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  if (total === 0) {
    return <span className="text-xs text-slate-400 dark:text-slate-600">No outcomes yet</span>;
  }

  const ranked = [...entries].sort((a, b) => b.count - a.count);

  return (
    <div className="min-w-[160px]">
      {/* No `overflow-hidden` on the track: it would clip the focus ring of the
          2px-tall segments, leaving keyboard users with no visible focus. */}
      <div className="flex h-2 rounded-full bg-slate-100 dark:bg-white/5">
        {entries.map((entry) => (
          <button
            key={entry.status}
            type="button"
            onClick={() => onFocus(entry.status)}
            aria-pressed={focus === entry.status}
            title={`${outcomeLabel(entry.status)}: ${num(entry.count)} — click to focus`}
            style={{
              width: `${(entry.count / total) * 100}%`,
              backgroundColor: OUTCOME_COLOUR[entry.status] ?? OUTCOME_COLOUR.unknown,
              opacity: focus && focus !== entry.status ? 0.3 : 1,
            }}
            className="h-full first:rounded-l-full last:rounded-r-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0a1128]"
          >
            <span className="sr-only">{outcomeLabel(entry.status)}</span>
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 capitalize truncate">
        {ranked
          .slice(0, 2)
          .map((entry) => `${outcomeLabel(entry.status)} ${Math.round((entry.count / total) * 100)}%`)
          .join(' · ')}
      </p>
    </div>
  );
}

function TableEmpty({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Users;
  title: string;
  hint: string;
}) {
  return (
    <div className="px-5 py-14 text-center">
      <Icon className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

function Card({
  title,
  subtitle,
  action,
  children,
  bodyClassName,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  bodyClassName?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </header>
      <div className={bodyClassName ?? 'p-5'}>{children}</div>
    </section>
  );
}

function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative w-full sm:w-60">
      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-3 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  );
}

function FilterChip({
  icon: Icon,
  dot,
  kind,
  label,
  onClear,
}: {
  icon?: typeof Users;
  dot?: string;
  kind: string;
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs">
      {Icon && <Icon className="w-3 h-3 text-slate-400" />}
      {dot && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />}
      <span className="text-slate-500 dark:text-slate-400">{kind}</span>
      <span className="font-medium capitalize text-slate-900 dark:text-white max-w-[14rem] truncate">
        {label}
      </span>
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove ${kind} filter`}
        className="p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
      >
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Headline numbers
// ---------------------------------------------------------------------------

function HeadlineCards({ totals }: { totals: AnalyticsTotals }) {
  const cards = [
    {
      label: 'Calls',
      value: num(totals.calls),
      hint: `${num(totals.connected)} connected`,
      icon: PhoneCall,
      tone: 'text-blue-500 bg-blue-500/10',
    },
    {
      label: 'Connect rate',
      value: `${totals.connectRate}%`,
      hint: 'dials that reached a person',
      icon: TrendingUp,
      tone: 'text-brand-500 bg-brand-500/10',
    },
    {
      label: 'Interest rate',
      value: `${totals.interestRate}%`,
      hint: `${num(totals.interested)} interested`,
      icon: Target,
      tone: 'text-emerald-500 bg-emerald-500/10',
    },
    {
      label: 'Avg duration',
      value: formatDuration(totals.avgDurationSec),
      hint: 'per connected call',
      icon: Timer,
      tone: 'text-amber-500 bg-amber-500/10',
    },
    {
      label: 'Talk time',
      value: formatDuration(totals.totalTalkTimeSec),
      hint: 'across the whole range',
      icon: Clock,
      tone: 'text-purple-500 bg-purple-500/10',
    },
    {
      label: 'Leads reached',
      value: num(totals.contactsReached),
      hint: 'unique contacts connected',
      icon: Users,
      tone: 'text-sky-500 bg-sky-500/10',
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
  );
}

// ---------------------------------------------------------------------------
// URL <-> state
// ---------------------------------------------------------------------------

/**
 * Next's `ReadonlyURLSearchParams` is not a `URLSearchParams` subclass — it only
 * mirrors the reading half — so these take the structural subset they use.
 */
type ReadableParams = Pick<URLSearchParams, 'get' | 'toString'>;

function readDays(params: ReadableParams, fallback: number): number {
  const raw = Number(params.get('days'));
  return (RANGES as readonly number[]).includes(raw) ? raw : fallback;
}

function readId(params: ReadableParams, key: string): string | null {
  const raw = (params.get(key) ?? '').trim();
  return raw || null;
}

function readOutcome(params: ReadableParams): OutcomeStatus | null {
  const raw = (params.get('outcome') ?? '').trim();
  // Validated against the known statuses so a hand-edited URL cannot smuggle an
  // arbitrary string into the colour maps.
  return (OUTCOME_ORDER as readonly string[]).includes(raw) ? (raw as OutcomeStatus) : null;
}

function fetchKey(days: number, employeeId: string | null, agentId: string | null, nonce: number) {
  return [days, employeeId ?? '', agentId ?? '', nonce].join('|');
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function AnalyticsDashboard({ initial }: { initial: AnalyticsPayload }) {
  // `useSearchParams` opts the subtree into dynamic rendering; the boundary keeps
  // that contained, and the fallback still shows the server-computed headline
  // numbers rather than a blank frame.
  return (
    <Suspense fallback={<DashboardFallback initial={initial} />}>
      <DashboardInner initial={initial} />
    </Suspense>
  );
}

function DashboardFallback({ initial }: { initial: AnalyticsPayload }) {
  return (
    <div className="space-y-6">
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Last {initial.days} days · {num(initial.totals.calls)} calls
      </div>
      <HeadlineCards totals={initial.totals} />
    </div>
  );
}

function DashboardInner({ initial }: { initial: AnalyticsPayload }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Read once: the URL seeds the view, then state owns it. Updates go back out
  // with `replace`, so Back still means "leave analytics" rather than stepping
  // through every filter the user tried.
  const [range, setRange] = useState(() => ({ days: readDays(params, initial.days), nonce: 0 }));
  const [employeeId, setEmployeeId] = useState<string | null>(() => readId(params, 'employeeId'));
  const [agentId, setAgentId] = useState<string | null>(() => readId(params, 'agentId'));
  const [outcome, setOutcome] = useState<OutcomeStatus | null>(() => readOutcome(params));

  const [data, setData] = useState<AnalyticsPayload>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Which request the numbers on screen came from, so the payload the server
  // already rendered is not immediately refetched.
  const servedRef = useRef(fetchKey(initial.days, initial.employeeId, initial.agentId, 0));

  useEffect(() => {
    const key = fetchKey(range.days, employeeId, agentId, range.nonce);
    if (servedRef.current === key) return;

    const controller = new AbortController();
    setPending(true);
    setError(null);

    const query = new URLSearchParams({ days: String(range.days) });
    if (employeeId) query.set('employeeId', employeeId);
    if (agentId) query.set('agentId', agentId);

    fetch(`/api/analytics?${query.toString()}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? 'Could not load analytics');
        }
        return (await res.json()) as AnalyticsPayload;
      })
      .then((payload) => {
        servedRef.current = key;
        setData(payload);
        setPending(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : 'Could not load analytics';
        setError(message);
        setPending(false);
        toast.error(message);
      });

    return () => controller.abort();
  }, [range, employeeId, agentId]);

  // Mirror the view into the query string so a filtered dashboard can be shared.
  useEffect(() => {
    const query = new URLSearchParams();
    if (range.days !== initial.days) query.set('days', String(range.days));
    if (employeeId) query.set('employeeId', employeeId);
    if (agentId) query.set('agentId', agentId);
    if (outcome) query.set('outcome', outcome);

    const next = query.toString();
    if (next === params.toString()) return;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [range.days, employeeId, agentId, outcome, initial.days, params, pathname, router]);

  const [employeeSort, setEmployeeSort] = useState<Sort<EmployeeSortKey>>({ key: 'calls', dir: 'desc' });
  const [agentSort, setAgentSort] = useState<Sort<AgentSortKey>>({ key: 'calls', dir: 'desc' });
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [agentQuery, setAgentQuery] = useState('');

  const employees = useMemo(() => {
    const needle = employeeQuery.trim().toLowerCase();
    const rows = data.byEmployee.filter((e) => {
      if (!needle) return true;
      return (
        e.name.toLowerCase().includes(needle) ||
        (e.employeeId ?? '').toLowerCase().includes(needle) ||
        e.role.toLowerCase().includes(needle)
      );
    });
    rows.sort((a, b) => {
      const cmp = compareEmployees(a, b, employeeSort.key);
      return employeeSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data.byEmployee, employeeSort, employeeQuery]);

  const agents = useMemo(() => {
    const needle = agentQuery.trim().toLowerCase();
    const rows = data.byAgent.filter((a) => {
      if (needle && !a.name.toLowerCase().includes(needle)) return false;
      // The payload carries an outcome breakdown per agent, so this filter can
      // be honoured client-side without another round trip.
      if (outcome && (a.outcomes[outcome] ?? 0) === 0) return false;
      return true;
    });
    rows.sort((a, b) => {
      const cmp = compareAgents(a, b, agentSort.key);
      return agentSort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data.byAgent, agentSort, agentQuery, outcome]);

  const employeeName = employeeId
    ? data.byEmployee.find((e) => e.id === employeeId)?.name ?? 'Selected employee'
    : null;
  const agentName = agentId
    ? data.byAgent.find((a) => a.id === agentId)?.name ?? 'Selected agent'
    : null;

  const outcomeFocus = useMemo(() => {
    if (!outcome) return null;
    const total = data.outcomes.reduce((sum, o) => sum + o.count, 0);
    const count = data.outcomes.find((o) => o.status === outcome)?.count ?? 0;
    return { count, total, share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 };
  }, [data.outcomes, outcome]);

  const hasFilters = Boolean(employeeId || agentId || outcome);

  function toggleEmployee(id: string) {
    setEmployeeId((current) => (current === id ? null : id));
  }

  function toggleAgent(id: string) {
    setAgentId((current) => (current === id ? null : id));
  }

  function toggleOutcome(status: OutcomeStatus) {
    setOutcome((current) => (current === status ? null : status));
  }

  function clearAll() {
    setEmployeeId(null);
    setAgentId(null);
    setOutcome(null);
  }

  const { totals } = data;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Date range"
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5"
        >
          {RANGES.map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={range.days === days}
              onClick={() => setRange((r) => (r.days === days ? r : { days, nonce: 0 }))}
              className={cn(
                'h-7 px-3 rounded-lg text-xs font-semibold transition-colors',
                range.days === days
                  ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              {days} days
            </button>
          ))}
        </div>

        {hasFilters && (
          <div className="flex flex-wrap items-center gap-2">
            {employeeId && employeeName && (
              <FilterChip
                icon={Users}
                kind="Employee"
                label={employeeName}
                onClear={() => setEmployeeId(null)}
              />
            )}
            {agentId && agentName && (
              <FilterChip icon={Bot} kind="Agent" label={agentName} onClear={() => setAgentId(null)} />
            )}
            {outcome && (
              <FilterChip
                dot={OUTCOME_COLOUR[outcome] ?? OUTCOME_COLOUR.unknown}
                kind="Outcome"
                label={outcomeLabel(outcome)}
                onClear={() => setOutcome(null)}
              />
            )}
            <button
              type="button"
              onClick={clearAll}
              className="h-7 px-2.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Clear all
            </button>
          </div>
        )}

        <div className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          {pending ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-brand-600 dark:text-brand-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
            </span>
          ) : (
            <span className="tabular-nums">
              {num(totals.calls)} calls over the last {data.days} days
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/60 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-200 min-w-0 flex-1">
            {error} — showing the last {data.days}-day figures instead.
          </p>
          <button
            type="button"
            onClick={() => setRange((r) => ({ ...r, nonce: r.nonce + 1 }))}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      <div
        aria-busy={pending}
        className={cn('space-y-6 transition-opacity duration-200', pending && 'opacity-50')}
      >
        {/* 1. Headline numbers */}
        <HeadlineCards totals={totals} />

        {/* An outcome focus is honoured wherever the payload carries an outcome
            breakdown; where it does not, say so rather than imply the numbers
            moved. */}
        {outcome && outcomeFocus && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 py-3">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: OUTCOME_COLOUR[outcome] ?? OUTCOME_COLOUR.unknown }}
            />
            <p className="text-sm text-slate-700 dark:text-slate-200">
              <span className="font-semibold capitalize">{outcomeLabel(outcome)}</span>
              {' — '}
              <span className="tabular-nums font-semibold text-slate-900 dark:text-white">
                {num(outcomeFocus.count)}
              </span>{' '}
              of <span className="tabular-nums">{num(outcomeFocus.total)}</span> calls (
              <span className="tabular-nums">{outcomeFocus.share}%</span>)
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Agent breakdowns are filtered to this outcome; headline and employee totals still cover
              every outcome.
            </p>
            <button
              type="button"
              onClick={() => setOutcome(null)}
              className="ml-auto h-7 px-2.5 rounded-lg text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          </div>
        )}

        {/* 2. Daily trend */}
        <Card
          title="Daily activity"
          subtitle={`Calls, connections and interested leads over ${data.days} days`}
        >
          <DailyTrendChart data={data.daily} />
        </Card>

        {/* 3a. Employee comparison */}
        <Card title="Employee comparison" subtitle="Top eight, on the metric you pick">
          <EmployeeComparisonChart
            employees={data.byEmployee}
            selectedId={employeeId}
            onSelect={toggleEmployee}
          />
        </Card>

        {/* 3b. Employee performance */}
        <Card
          title="Employee performance"
          subtitle="Campaign calls count towards the lead's owner; manual dials towards whoever placed them"
          action={
            <SearchBox
              value={employeeQuery}
              onChange={setEmployeeQuery}
              placeholder="Search name or ID…"
              label="Search employees"
            />
          }
          bodyClassName=""
        >
          {employees.length === 0 ? (
            <TableEmpty
              icon={Users}
              title={data.byEmployee.length === 0 ? 'No team members yet' : 'No matches'}
              hint={
                data.byEmployee.length === 0
                  ? 'Invite employees from the Team screen and their numbers appear here.'
                  : 'Try a different search.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                  <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                    <SortHeader label="Employee" sortKey="name" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} align="left" />
                    <SortHeader label="Calls" sortKey="calls" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Connect rate" sortKey="connectRate" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Interest rate" sortKey="interestRate" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Avg duration" sortKey="avgDurationSec" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Talk time" sortKey="totalTalkTimeSec" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Leads" sortKey="leadsAssigned" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Callbacks" sortKey="callbacksBooked" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <SortHeader label="Last seen" sortKey="lastLoginAt" sort={employeeSort} onSort={(k) => setEmployeeSort((s) => nextSort(s, k))} />
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {employees.map((e) => {
                    const active = employeeId === e.id;
                    return (
                      <tr
                        key={e.id}
                        className={cn(
                          'group hover:bg-slate-50 dark:hover:bg-white/[0.02]',
                          active && 'bg-brand-500/[0.06] dark:bg-brand-500/10'
                        )}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleEmployee(e.id)}
                            aria-pressed={active}
                            title={active ? 'Clear this filter' : `Filter the dashboard to ${e.name}`}
                            className="block min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <span className="block font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                              {e.name}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              {e.employeeId && <span className="tabular-nums">{e.employeeId}</span>}
                              {e.role === 'admin' && (
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
                                  Admin
                                </span>
                              )}
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                          {num(e.calls)}
                        </td>
                        <RateCell value={e.connectRate} tone="brand" />
                        <RateCell value={e.interestRate} tone="emerald" />
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatDuration(e.avgDurationSec)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatDuration(e.totalTalkTimeSec)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {num(e.leadsAssigned)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {num(e.callbacksBooked)}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {relativeTime(e.lastLoginAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/team/${e.id}`}
                            title={`Open ${e.name}`}
                            className="inline-flex items-center text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                            <span className="sr-only">Open {e.name}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 4a. Agent outcome mix */}
        <Card
          title="Agent outcome mix"
          subtitle="Every call each agent ran, stacked by how it was classified"
        >
          <AgentOutcomeChart
            agents={data.byAgent}
            selectedId={agentId}
            onSelect={toggleAgent}
            focusOutcome={outcome}
            onFocusOutcome={toggleOutcome}
          />
        </Card>

        {/* 4b. Agent performance */}
        <Card
          title="Agent performance"
          subtitle="How each AI agent converts the calls it runs"
          action={
            <SearchBox
              value={agentQuery}
              onChange={setAgentQuery}
              placeholder="Search agents…"
              label="Search agents"
            />
          }
          bodyClassName=""
        >
          {agents.length === 0 ? (
            <TableEmpty
              icon={Bot}
              title={data.byAgent.length === 0 ? 'No agents yet' : 'No matches'}
              hint={
                data.byAgent.length === 0
                  ? 'Create an agent and its calling record shows up here.'
                  : 'No agent matches the current search and filters.'
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[860px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                  <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                    <SortHeader label="Agent" sortKey="name" sort={agentSort} onSort={(k) => setAgentSort((s) => nextSort(s, k))} align="left" />
                    <SortHeader label="Calls" sortKey="calls" sort={agentSort} onSort={(k) => setAgentSort((s) => nextSort(s, k))} />
                    <SortHeader label="Connect rate" sortKey="connectRate" sort={agentSort} onSort={(k) => setAgentSort((s) => nextSort(s, k))} />
                    <SortHeader label="Interest rate" sortKey="interestRate" sort={agentSort} onSort={(k) => setAgentSort((s) => nextSort(s, k))} />
                    <SortHeader label="Avg duration" sortKey="avgDurationSec" sort={agentSort} onSort={(k) => setAgentSort((s) => nextSort(s, k))} />
                    <th scope="col" className="px-4 py-3 font-medium">Outcome mix</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {agents.map((a) => {
                    const active = agentId === a.id;
                    return (
                      <tr
                        key={a.id}
                        className={cn(
                          'group hover:bg-slate-50 dark:hover:bg-white/[0.02]',
                          active && 'bg-brand-500/[0.06] dark:bg-brand-500/10'
                        )}
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => toggleAgent(a.id)}
                            aria-pressed={active}
                            title={active ? 'Clear this filter' : `Filter the dashboard to ${a.name}`}
                            className="flex items-center gap-2.5 min-w-0 text-left rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                          >
                            <span className="w-8 h-8 shrink-0 rounded-lg bg-brand-500/10 flex items-center justify-center">
                              <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                                {a.name}
                              </span>
                              <span
                                className={cn(
                                  'mt-0.5 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium',
                                  a.isActive
                                    ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                                    : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                                )}
                              >
                                {a.isActive ? 'Active' : 'Draft'}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                          {num(a.calls)}
                        </td>
                        <RateCell value={a.connectRate} tone="brand" />
                        <RateCell value={a.interestRate} tone="emerald" />
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                          {formatDuration(a.avgDurationSec)}
                        </td>
                        <td className="px-4 py-3">
                          <OutcomeMix outcomes={a.outcomes} focus={outcome} onFocus={toggleOutcome} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/admin/agents/${a.id}`}
                            title={`Open ${a.name}`}
                            className="inline-flex items-center text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                          >
                            <ChevronRight className="w-4 h-4" />
                            <span className="sr-only">Open {a.name}</span>
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* 5. Outcome mix */}
        <Card
          title="Lead outcomes"
          subtitle="How every call in the range was classified"
          action={<PieChartIcon className="w-4 h-4 text-slate-400 dark:text-slate-600" />}
        >
          <OutcomeDonut outcomes={data.outcomes} selected={outcome} onSelect={toggleOutcome} />
        </Card>
      </div>
    </div>
  );
}
