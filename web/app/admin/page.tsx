import Link from 'next/link';
import { CallStatus, CampaignStatus, LeadStatus, UserStatus } from '@prisma/client';
import {
  ArrowUpRight,
  BarChart3,
  Bot,
  Megaphone,
  PhoneCall,
  Plus,
  Trophy,
  TrendingUp,
  Users,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import {
  visibleAgents, visibleCalls, visibleCampaigns, visibleContacts, visibleUsers,
} from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { LiveCallsPanel } from '@/components/voice/live-calls-panel';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const IN_FLIGHT = [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress];

function formatDuration(sec: number): string {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  return m ? `${m}m ${Math.round(sec % 60)}s` : `${Math.round(sec)}s`;
}

/** Podium tint, gold → bronze. */
const RANK_TONE = [
  'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300',
  'bg-orange-100 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400',
];

export default async function AdminOverview() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // One tenant scope per model, composed into every figure below. The overview
  // fans out seventeen queries; scoping them individually is seventeen chances
  // to forget, and the one that forgets shows another company's numbers on this
  // company's front page.
  const callScope = visibleCalls(user);
  const agentScope = visibleAgents(user);
  const contactScope = visibleContacts(user);
  const campaignScope = visibleCampaigns(user);
  const userScope = visibleUsers(user);

  const today = { ...callScope, startedAt: { gte: startOfDay } };

  // Every figure below is read fresh on each request: the page is
  // force-dynamic, and the live rail's own polling ends in router.refresh(),
  // which re-runs exactly this function. Nothing here may be cached or hoisted
  // out, or the "live" numbers would freeze at whatever the first render saw.
  const [
    agentCount, activeAgents, contactCount, runningCampaigns,
    callsToday, answeredToday, interestedToday, liveCalls, liveCallCount, recentCalls, avgAgg,
    // Today's calls split by the two halves of the attribution rule: dials that
    // carry an operator, and campaign dials that do not and therefore belong to
    // whoever owns the lead. Grouped, so this stays four queries at any volume.
    startedCalls, ownedCalls, startedInterested, ownedInterested, activeUsers,
  ] = await Promise.all([
    db.agent.count({ where: agentScope }),
    db.agent.count({ where: { ...agentScope, isActive: true } }),
    db.contact.count({ where: contactScope }),
    db.campaign.count({ where: { ...campaignScope, status: CampaignStatus.running } }),
    db.call.count({ where: today }),
    db.call.count({ where: { ...today, durationSec: { gt: 0 } } }),
    db.call.count({ where: { ...today, interested: true } }),
    db.call.findMany({
      where: { ...callScope, status: { in: IN_FLIGHT } },
      orderBy: { startedAt: 'desc' },
      take: 12,
      include: { contact: { select: { name: true } }, agent: { select: { name: true } } },
    }),
    // Counted separately because the rail above is capped at 12 rows: on a busy
    // campaign its length would under-report what is actually on the phones.
    db.call.count({ where: { ...callScope, status: { in: IN_FLIGHT } } }),
    db.call.findMany({
      where: { ...callScope, status: CallStatus.completed },
      orderBy: { startedAt: 'desc' },
      take: 8,
      include: { contact: { select: { name: true } }, campaign: { select: { name: true } } },
    }),
    db.call.aggregate({
      where: { ...today, durationSec: { gt: 0 } },
      _avg: { durationSec: true },
    }),
    db.call.groupBy({
      by: ['startedById'],
      where: { ...today, startedById: { not: null } },
      _count: true,
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { ...today, startedById: null, contactId: { not: null } },
      _count: true,
    }),
    db.call.groupBy({
      by: ['startedById'],
      where: { ...today, startedById: { not: null }, interested: true },
      _count: true,
    }),
    db.call.groupBy({
      by: ['contactId'],
      where: { ...today, startedById: null, contactId: { not: null }, interested: true },
      _count: true,
    }),
    db.user.findMany({
      where: { ...userScope, status: UserStatus.active },
      select: { id: true, name: true, employeeId: true },
    }),
  ]);

  // Resolve owners only for the contacts that actually appear today, rather
  // than reading the whole table.
  const contactIds = Array.from(
    new Set(
      [...ownedCalls, ...ownedInterested]
        .map((r) => r.contactId)
        .filter((id): id is string => Boolean(id))
    )
  );
  const owners = contactIds.length
    ? await db.contact.findMany({
        where: { ...contactScope, id: { in: contactIds } },
        select: { id: true, assignedToId: true },
      })
    : [];
  const ownerOf = new Map(owners.map((c) => [c.id, c.assignedToId]));

  const callsBy = new Map<string, number>();
  const interestedBy = new Map<string, number>();

  function add(into: Map<string, number>, userId: string | null | undefined, n: number) {
    if (!userId) return;
    into.set(userId, (into.get(userId) ?? 0) + n);
  }

  for (const r of startedCalls) add(callsBy, r.startedById, r._count);
  for (const r of ownedCalls) add(callsBy, r.contactId ? ownerOf.get(r.contactId) : null, r._count);
  for (const r of startedInterested) add(interestedBy, r.startedById, r._count);
  for (const r of ownedInterested) {
    add(interestedBy, r.contactId ? ownerOf.get(r.contactId) : null, r._count);
  }

  const topPerformers = activeUsers
    .map((u) => ({
      id: u.id,
      name: u.name,
      employeeId: u.employeeId,
      calls: callsBy.get(u.id) ?? 0,
      interested: interestedBy.get(u.id) ?? 0,
    }))
    .filter((p) => p.calls > 0)
    .sort((a, b) => b.calls - a.calls || b.interested - a.interested || a.name.localeCompare(b.name))
    .slice(0, 3);

  const connectRate = callsToday ? Math.round((answeredToday / callsToday) * 100) : 0;
  const interestRate = answeredToday ? Math.round((interestedToday / answeredToday) * 100) : 0;

  const stats = [
    { label: 'Calls today', value: String(callsToday), icon: PhoneCall, tone: 'text-blue-500 bg-blue-500/10' },
    { label: 'Connect rate', value: callsToday ? `${connectRate}%` : '—', icon: TrendingUp, tone: 'text-brand-500 bg-brand-500/10' },
    { label: 'Interested', value: answeredToday ? `${interestRate}%` : '—', icon: TrendingUp, tone: 'text-purple-500 bg-purple-500/10' },
    { label: 'Avg duration', value: formatDuration(avgAgg._avg.durationSec ?? 0), icon: PhoneCall, tone: 'text-amber-500 bg-amber-500/10' },
    { label: 'Active agents', value: `${activeAgents}/${agentCount}`, icon: Bot, tone: 'text-sky-500 bg-sky-500/10' },
    { label: 'Running campaigns', value: String(runningCampaigns), icon: Megaphone, tone: 'text-indigo-500 bg-indigo-500/10' },
  ];

  return (
    <>
      <PageHeader
        title="Overview"
        subtitle={`Live calling activity across the company · ${contactCount} leads on file`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/admin/analytics"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <BarChart3 className="w-4 h-4" /> Analytics
            </Link>
            <Link
              href="/admin/agents/new"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
            >
              <Plus className="w-4 h-4" /> New agent
            </Link>
          </div>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        {/* The panel polls itself while a call is in flight; nothing else on
            this page may poll, or one dashboard would fan out into several
            overlapping refreshes of the same queries. */}
        <LiveCallsPanel
          liveCount={liveCallCount}
          initialCalls={liveCalls.map((c) => ({
            id: c.id,
            phone: c.phone,
            name: c.contact?.name ?? null,
            status: c.status,
            agentName: c.agent?.name ?? null,
            startedAt: c.startedAt.toISOString(),
          }))}
        />

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', s.tone)}>
                <s.icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <section className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Top performers today</h2>
              </div>
              <Link href="/admin/analytics" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
                Full breakdown <ArrowUpRight className="w-3 h-3" />
              </Link>
            </header>

            {topPerformers.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Users className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No calls placed today</p>
                <p className="text-xs text-slate-500 mt-1">
                  Rankings appear once the team starts dialling.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {topPerformers.map((p, i) => (
                  <li key={p.id}>
                    <Link
                      href={`/admin/team/${p.id}`}
                      className="group flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <span className={cn('w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold tabular-nums', RANK_TONE[i])}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {p.employeeId ?? 'No employee ID'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{p.calls}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">calls</p>
                      </div>
                      <div className="text-right shrink-0 w-16">
                        <p className="text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">{p.interested}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">interested</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <Link
            href="/admin/analytics"
            className="group flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-5 hover:border-brand-500/40 dark:hover:border-brand-500/30 transition-colors"
          >
            <div>
              <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center mb-3">
                <BarChart3 className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                Analytics
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Compare every employee and every agent over 7, 30 or 90 days — connect and interest
                rates, talk time, callbacks and the outcome mix.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400">
              Open analytics <ArrowUpRight className="w-3 h-3" />
            </span>
          </Link>
        </div>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent completed calls</h2>
            <Link href="/admin/calls" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
              All calls <ArrowUpRight className="w-3 h-3" />
            </Link>
          </header>

          {recentCalls.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Users className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No calls yet</p>
              <p className="text-xs text-slate-500 mt-1">
                Import contacts and start a campaign to see results here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {recentCalls.map((c) => (
                <li key={c.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {c.contact?.name || c.phone}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {c.campaign?.name ? `${c.campaign.name} · ` : ''}
                      {formatDuration(c.durationSec)}
                    </p>
                  </div>
                  <LeadBadge status={c.leadStatus} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

const LEAD_TONE: Record<string, string> = {
  [LeadStatus.interested]: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  [LeadStatus.callback_requested]: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  [LeadStatus.not_interested]: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
  [LeadStatus.no_answer]: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500',
  [LeadStatus.voicemail]: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500',
  [LeadStatus.unknown]: 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500',
};

function LeadBadge({ status }: { status: LeadStatus }) {
  return (
    <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium', LEAD_TONE[status])}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}
