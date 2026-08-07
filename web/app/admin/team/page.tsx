import { redirect } from 'next/navigation';
import { CallStatus, Role } from '@prisma/client';
import { BadgeCheck } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { TeamManager, type TeamMember } from '@/components/team/team-manager';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const me = await getCurrentUser();
  if (!me) redirect('/login');
  if (me.role !== Role.admin) redirect('/dashboard');

  // Admins first, then by employee id rather than by name. Employee ids are
  // assigned in joining order, so the roster reads the way the team actually
  // grew — and, unlike a name sort, it does not reshuffle the moment somebody
  // is renamed.
  const users = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { employeeId: 'asc' }],
    include: { _count: { select: { assignedContacts: true } } },
  });

  // Per-member activity, in grouped queries rather than one pass per user.
  const [callsToday, interested, completedAll] = await Promise.all([
    db.call.groupBy({
      by: ['contactId'],
      where: { startedAt: { gte: startOfDay } },
      _count: true,
    }),
    db.call.groupBy({ by: ['contactId'], where: { interested: true }, _count: true }),
    db.call.groupBy({
      by: ['contactId'],
      where: { status: CallStatus.completed },
      _count: true,
    }),
  ]);

  // Map contact -> owner so call counts can be attributed to a member.
  const owners = await db.contact.findMany({ select: { id: true, assignedToId: true } });
  const ownerOf = new Map(owners.map((c) => [c.id, c.assignedToId]));

  function tally(rows: { contactId: string | null; _count: number }[]) {
    const out = new Map<string, number>();
    for (const r of rows) {
      const owner = r.contactId ? ownerOf.get(r.contactId) : null;
      if (owner) out.set(owner, (out.get(owner) ?? 0) + r._count);
    }
    return out;
  }

  const todayBy = tally(callsToday);
  const interestedBy = tally(interested);
  const completedBy = tally(completedAll);

  const members: TeamMember[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    employeeId: u.employeeId,
    role: u.role,
    status: u.status,
    phone: u.phone,
    department: u.department,
    designation: u.designation,
    dailyCallLimit: u.dailyCallLimit,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    leads: u._count.assignedContacts,
    callsToday: todayBy.get(u.id) ?? 0,
    completed: completedBy.get(u.id) ?? 0,
    interested: interestedBy.get(u.id) ?? 0,
  }));

  const admins = users.filter((u) => u.role === Role.admin);
  const employees = users.filter((u) => u.role === Role.employee);

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={`${admins.length} admin${admins.length === 1 ? '' : 's'} · ${employees.length} employee${employees.length === 1 ? '' : 's'}`}
      />

      <div className="px-6 pb-10 space-y-6">
        <TeamManager members={members} currentUserId={me?.id ?? null} />

        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <BadgeCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
          Members sign in with either their email address or employee ID. Accounts exist only by
          invitation — there is no public sign-up.
        </p>
      </div>
    </>
  );
}
