import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ContactStatus } from '@prisma/client';
import {
  Bot,
  CalendarClock,
  ChevronRight,
  Clock,
  PhoneCall,
  PieChart as PieChartIcon,
  Target,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import { getCurrentUser } from '@/lib/auth';
import { DEFAULT_DAYS, RANGE_OPTIONS, computeMyAnalytics } from '@/lib/analytics';
import { PageHeader } from '@/components/shell/page-header';
import { DailyTrendChart, OutcomeDonut } from '@/components/analytics/charts';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// Fixed locale on the server too: an Indian deployment reads "1,00,000".
const NUMBER = new Intl.NumberFormat('en-IN');

function num(value: number): string {
  return NUMBER.format(value);
}

// Deliberately not imported from components/analytics/charts: that module is a
// client component, so its exports arrive here as client references that a
// server render cannot call.
function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours) return `${hours}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

function humanise(value: string): string {
  return value.replace(/_/g, ' ');
}

/** Pipeline colours. Chosen to read on both card backgrounds, like the charts. */
const PIPELINE_COLOUR: Record<ContactStatus, string> = {
  pending: '#94a3b8',
  calling: '#3aa0dd',
  retry: '#f59e0b',
  completed: '#10b981',
  exhausted: '#8b5cf6',
  do_not_call: '#ef4444',
};

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

/** A rate reads as a number in isolation; the bar makes rows comparable. */
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

function EmptyBlock({
  icon: Icon,
  title,
  hint,
}: {
  icon: typeof Bot;
  title: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-white/10 px-6 py-12 text-center">
      <Icon className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{hint}</p>
    </div>
  );
}

/**
 * An employee's own calling record.
 *
 * The range lives in the URL rather than in client state: the whole screen is
 * server-rendered from `computeMyAnalytics`, so switching range is a navigation
 * that reuses loading.tsx, and there is no second copy of the aggregation in
 * the browser. /api/analytics/mine serves the same payload to anything that
 * wants it programmatically.
 */
export default async function MyAnalyticsPage({
  searchParams,
}: {
  searchParams?: { days?: string | string[] };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const raw = Array.isArray(searchParams?.days) ? searchParams?.days[0] : searchParams?.days;
  const requested = Number(raw);
  // Only the offered ranges are honoured, so a hand-typed ?days= cannot produce
  // a control that shows nothing selected.
  const days = (RANGE_OPTIONS as readonly number[]).includes(requested) ? requested : DEFAULT_DAYS;

  const data = await computeMyAnalytics(user.id, { days });
  const { totals, me } = data;

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
      label: 'Callbacks booked',
      value: num(data.callbacksBooked),
      hint: `${num(totals.contactsReached)} leads reached`,
      icon: CalendarClock,
      tone: 'text-sky-500 bg-sky-500/10',
    },
  ];

  const pipeline = data.leadsByStatus.filter((s) => s.count > 0);
  const pipelineTotal = pipeline.reduce((sum, s) => sum + s.count, 0);

  return (
    <>
      <PageHeader
        title="My performance"
        subtitle="Your calls, connect rate and outcomes — nobody else's numbers are in here"
        action={
          <Link
            href="/dashboard/calls"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
          >
            <PhoneCall className="w-4 h-4" /> My calls
          </Link>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Date range"
            className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/5"
          >
            {RANGE_OPTIONS.map((option) => (
              <Link
                key={option}
                href={`/dashboard/analytics?days=${option}`}
                aria-current={days === option ? 'page' : undefined}
                className={cn(
                  'h-7 px-3 rounded-lg text-xs font-semibold transition-colors',
                  'inline-flex items-center',
                  days === option
                    ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                )}
              >
                {option} days
              </Link>
            ))}
          </nav>

          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {num(totals.calls)} calls over the last {data.days} days
          </p>
        </div>

        {/* 1. Headline numbers */}
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

        {/* 2. Daily trend */}
        <Card
          title="My daily activity"
          subtitle={`Calls, connections and interested leads over ${data.days} days`}
        >
          <DailyTrendChart data={data.daily} />
        </Card>

        {/* 3. Outcome mix and pipeline, side by side */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card
            title="My call outcomes"
            subtitle="How each of your calls in the range was classified"
            action={<PieChartIcon className="w-4 h-4 text-slate-400 dark:text-slate-600" />}
          >
            <OutcomeDonut outcomes={data.outcomes} />
          </Card>

          <Card
            title="My lead pipeline"
            subtitle={`${num(me.leadsAssigned)} leads assigned to you right now`}
            action={<Users className="w-4 h-4 text-slate-400 dark:text-slate-600" />}
          >
            {pipelineTotal === 0 ? (
              <EmptyBlock
                icon={Users}
                title="No leads assigned yet"
                hint="An admin assigns leads to you, and their progress shows up here."
              />
            ) : (
              <div className="space-y-4">
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 dark:bg-white/5">
                  {pipeline.map((slice) => (
                    <span
                      key={slice.status}
                      title={`${humanise(slice.status)}: ${num(slice.count)}`}
                      style={{
                        width: `${(slice.count / pipelineTotal) * 100}%`,
                        backgroundColor: PIPELINE_COLOUR[slice.status],
                      }}
                    />
                  ))}
                </div>

                <ul className="space-y-2">
                  {pipeline.map((slice) => (
                    <li key={slice.status} className="flex items-center gap-2.5 text-sm">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: PIPELINE_COLOUR[slice.status] }}
                      />
                      <span className="capitalize text-slate-600 dark:text-slate-300">
                        {humanise(slice.status)}
                      </span>
                      <span className="ml-auto tabular-nums font-medium text-slate-900 dark:text-white">
                        {num(slice.count)}
                      </span>
                      <span className="w-11 text-right tabular-nums text-xs text-slate-500 dark:text-slate-400">
                        {Math.round((slice.count / pipelineTotal) * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        {/* 4. Agents this person actually used */}
        <Card
          title="Agents I used"
          subtitle="How each AI agent performed on your calls in this range"
          bodyClassName=""
        >
          {data.byAgent.length === 0 ? (
            <div className="p-5">
              <EmptyBlock
                icon={Bot}
                title="No agent calls in this period"
                hint="Run a campaign or dial a lead, and the agent's record appears here."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="sticky top-0 z-10 bg-white dark:bg-[#0a1128]">
                  <tr className="border-b border-slate-200 dark:border-white/10 text-left text-xs text-slate-500 dark:text-slate-400">
                    <th scope="col" className="px-4 py-3 font-medium">Agent</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Calls</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Connect rate</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Interest rate</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Avg duration</th>
                    <th scope="col" className="px-4 py-3 font-medium text-right">Interested</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {data.byAgent.map((agent) => (
                    <tr key={agent.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/agents/${agent.id}`} className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 shrink-0 rounded-lg bg-brand-500/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                          </span>
                          <span className="min-w-0">
                            <span className="block font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                              {agent.name}
                            </span>
                            <span
                              className={cn(
                                'mt-0.5 inline-block px-2 py-0.5 rounded-full text-[11px] font-medium',
                                agent.isActive
                                  ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                                  : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                              )}
                            >
                              {agent.isActive ? 'Active' : 'Draft'}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900 dark:text-white">
                        {num(agent.calls)}
                      </td>
                      <RateCell value={agent.connectRate} tone="brand" />
                      <RateCell value={agent.interestRate} tone="emerald" />
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {formatDuration(agent.avgDurationSec)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {num(agent.interested)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/agents/${agent.id}`}
                          className="inline-flex items-center text-slate-400 hover:text-brand-600 dark:hover:text-brand-400 transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                          <span className="sr-only">Open {agent.name}</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
