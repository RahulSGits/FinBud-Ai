import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Prisma, Role, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import {
  EmployeeDetail,
  type ActivityEntry,
  type CreatedAgent,
  type CreatedCampaign,
  type EmployeeCallRow,
  type EmployeeProfile,
  type EmployeeStats,
} from '@/components/team/employee-detail';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const ROLE_TONE: Record<Role, string> = {
  admin: 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
  employee: 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400',
};

const STATUS_TONE: Record<UserStatus, string> = {
  active: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  invited: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  disabled: 'bg-slate-100 dark:bg-white/5 text-slate-500',
};

function pct(part: number, whole: number): number | null {
  if (!whole) return null;
  return Math.round((part / whole) * 100);
}

export default async function EmployeePage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  // middleware.ts already keeps employees out of /admin, but routing is not the
  // security boundary — the page re-checks for itself.
  if (user.role !== 'admin') redirect('/dashboard');

  const target = await db.user.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      phone: true, department: true, designation: true, dailyCallLimit: true,
      mustChangePassword: true, lastLoginAt: true, createdAt: true,
    },
  });
  if (!target) notFound();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since7 = new Date(Date.now() - 7 * DAY_MS);
  const since30 = new Date(Date.now() - 30 * DAY_MS);

  // The same shape as visibleCalls() in lib/authz, but pinned to the employee
  // being inspected rather than to the admin doing the inspecting — that helper
  // returns {} for an admin, which would widen this to the whole company.
  const callScope: Prisma.CallWhereInput = {
    OR: [{ contact: { assignedToId: target.id } }, { startedById: target.id }],
  };

  const [
    calls, callsToday, calls7d, calls30d, callsAll, connected, interested,
    durationAgg, leadRows, leadsTotal, callbacksBooked, agents, campaigns, activity,
    activeAdminCount,
  ] = await Promise.all([
    db.call.findMany({
      where: callScope,
      orderBy: { startedAt: 'desc' },
      take: 200,
      include: {
        contact: { select: { name: true } },
        agent: { select: { name: true } },
        campaign: { select: { name: true } },
      },
    }),
    db.call.count({ where: { ...callScope, startedAt: { gte: startOfDay } } }),
    db.call.count({ where: { ...callScope, startedAt: { gte: since7 } } }),
    db.call.count({ where: { ...callScope, startedAt: { gte: since30 } } }),
    db.call.count({ where: callScope }),
    // A call with airtime is a call that was answered.
    db.call.count({ where: { ...callScope, durationSec: { gt: 0 } } }),
    db.call.count({ where: { ...callScope, interested: true } }),
    db.call.aggregate({
      where: { ...callScope, durationSec: { gt: 0 } },
      _avg: { durationSec: true },
      _sum: { durationSec: true },
    }),
    db.contact.groupBy({
      by: ['status'],
      where: { assignedToId: target.id },
      _count: true,
    }),
    db.contact.count({ where: { assignedToId: target.id } }),
    db.note.count({ where: { authorId: target.id, callbackAt: { not: null } } }),
    db.agent.findMany({
      where: { createdById: target.id },
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { calls: true, campaigns: true } } },
    }),
    db.campaign.findMany({
      where: { createdById: target.id },
      orderBy: { createdAt: 'desc' },
      include: {
        agent: { select: { name: true } },
        _count: { select: { contacts: true, calls: true } },
      },
    }),
    // Both what they did and what was done to their account: a password reset by
    // another admin belongs in an access history just as much as a login does.
    db.auditLog.findMany({
      where: { OR: [{ userId: target.id }, { entity: 'User', entityId: target.id }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { select: { id: true, name: true } } },
    }),
    db.user.count({ where: { role: Role.admin, status: UserStatus.active } }),
  ]);

  const profile: EmployeeProfile = {
    id: target.id,
    name: target.name,
    email: target.email,
    employeeId: target.employeeId,
    role: target.role,
    status: target.status,
    phone: target.phone,
    department: target.department,
    designation: target.designation,
    dailyCallLimit: target.dailyCallLimit,
    mustChangePassword: target.mustChangePassword,
    lastLoginAt: target.lastLoginAt?.toISOString() ?? null,
    createdAt: target.createdAt.toISOString(),
  };

  const stats: EmployeeStats = {
    callsToday,
    calls7d,
    calls30d,
    callsAll,
    connected,
    interested,
    connectRate: pct(connected, callsAll),
    interestRate: pct(interested, connected),
    avgDurationSec: Math.round(durationAgg._avg.durationSec ?? 0),
    totalTalkSec: durationAgg._sum.durationSec ?? 0,
    callbacksBooked,
    leadsTotal,
    leadsByStatus: leadRows
      .map((r) => ({ status: r.status as string, count: r._count }))
      .sort((a, b) => b.count - a.count),
  };

  const callRows: EmployeeCallRow[] = calls.map((c) => ({
    id: c.id,
    phone: c.phone,
    contactName: c.contact?.name ?? null,
    agentName: c.agent?.name ?? null,
    campaignName: c.campaign?.name ?? null,
    status: c.status,
    leadStatus: c.leadStatus,
    durationSec: c.durationSec,
    summary: c.summary,
    transcriptText: c.transcriptText,
    startedAt: c.startedAt.toISOString(),
  }));

  const createdAgents: CreatedAgent[] = agents.map((a) => ({
    id: a.id,
    name: a.name,
    description: a.description,
    isActive: a.isActive,
    calls: a._count.calls,
    campaigns: a._count.campaigns,
    updatedAt: a.updatedAt.toISOString(),
  }));

  const createdCampaigns: CreatedCampaign[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    agentName: c.agent.name,
    contacts: c._count.contacts,
    calls: c._count.calls,
    createdAt: c.createdAt.toISOString(),
  }));

  const activityEntries: ActivityEntry[] = activity.map((a) => ({
    id: a.id,
    action: a.action,
    entity: a.entity,
    entityId: a.entityId,
    actorName: a.user?.name ?? null,
    byThemselves: a.userId === target.id,
    createdAt: a.createdAt.toISOString(),
  }));

  const subtitle = [
    target.email,
    target.employeeId,
    target.designation,
    target.department,
  ].filter(Boolean).join(' · ');

  return (
    <>
      <PageHeader
        title={target.name}
        subtitle={subtitle}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', ROLE_TONE[target.role])}>
              {target.role}
            </span>
            <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium', STATUS_TONE[target.status])}>
              {target.status === 'invited' ? 'invite sent' : target.status}
            </span>
            <Link
              href="/admin/team"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> All team
            </Link>
          </div>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        <EmployeeDetail
          employee={profile}
          stats={stats}
          calls={callRows}
          agents={createdAgents}
          campaigns={createdCampaigns}
          activity={activityEntries}
          isSelf={user.id === target.id}
          activeAdminCount={activeAdminCount}
        />
      </div>
    </>
  );
}
