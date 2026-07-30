import Link from 'next/link';
import { CallStatus, LeadStatus } from '@prisma/client';
import {
  PhoneCall, TrendingUp, Users, CalendarClock, ArrowUpRight, Bot, Megaphone, Plus,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const CALLBACK_PAGE_SIZE = 20;

function untilNow(target: Date, now: Date): string {
  const mins = Math.floor((target.getTime() - now.getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `in ${mins}m`;
  if (mins < 1440) return `in ${Math.floor(mins / 60)}h`;
  return `in ${Math.floor(mins / 1440)}d`;
}

export default async function EmployeeDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // Admins get the fuller picture; this page is scoped to one person's work.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const mine = { assignedToId: user.id };
  // One instant for both the count and the list, so they can never disagree.
  const now = new Date();
  const upcomingWhere = { authorId: user.id, callbackAt: { gte: now } };

  // Authored-by rather than the visibleAgents/visibleCampaigns scopes: those
  // widen to everything for an admin, and this page is one person's own work
  // whoever is looking at it.
  const authored = { createdById: user.id };

  const [assigned, callsToday, interested, callbacks, myAgents, myCampaigns, upcoming, recent] = await Promise.all([
    db.contact.count({ where: mine }),
    db.call.count({ where: { contact: mine, startedAt: { gte: startOfDay } } }),
    db.call.count({ where: { contact: mine, interested: true } }),
    db.note.count({ where: upcomingWhere }),
    db.agent.count({ where: authored }),
    db.campaign.count({ where: authored }),
    db.note.findMany({
      where: upcomingWhere,
      orderBy: { callbackAt: 'asc' },
      take: CALLBACK_PAGE_SIZE,
      include: { contact: { select: { id: true, name: true, phone: true } } },
    }),
    db.call.findMany({
      where: { contact: mine, status: CallStatus.completed },
      orderBy: { startedAt: 'desc' },
      take: 10,
      include: { contact: { select: { id: true, name: true } } },
    }),
  ]);

  const stats = [
    { label: 'My leads', value: String(assigned), icon: Users, tone: 'text-blue-500 bg-blue-500/10' },
    { label: 'Calls today', value: String(callsToday), icon: PhoneCall, tone: 'text-brand-500 bg-brand-500/10' },
    { label: 'Interested', value: String(interested), icon: TrendingUp, tone: 'text-purple-500 bg-purple-500/10' },
    { label: 'Upcoming callbacks', value: String(callbacks), icon: CalendarClock, tone: 'text-amber-500 bg-amber-500/10' },
    { label: 'My agents', value: String(myAgents), icon: Bot, tone: 'text-sky-500 bg-sky-500/10' },
    { label: 'My campaigns', value: String(myCampaigns), icon: Megaphone, tone: 'text-emerald-500 bg-emerald-500/10' },
  ];

  const quickActions = [
    { href: '/dashboard/agents/new', label: 'New agent', icon: Plus, primary: true },
    { href: '/dashboard/campaigns', label: 'New campaign', icon: Megaphone, primary: false },
    { href: '/dashboard/leads', label: 'My leads', icon: Users, primary: false },
  ];

  return (
    <>
      <PageHeader title={`Good to see you, ${user.name.split(' ')[0]}`} subtitle="Your leads, your agents and today's activity" />

      <div className="px-6 pb-10 space-y-6">
        <div className="flex flex-wrap items-center gap-2.5">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                'inline-flex items-center gap-2 h-9 px-4 rounded-xl text-sm transition-colors',
                action.primary
                  ? 'bg-brand-600 hover:bg-brand-500 text-white font-semibold'
                  : 'border border-slate-200 dark:border-white/10 font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5'
              )}
            >
              <action.icon className="w-4 h-4" /> {action.label}
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
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

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Upcoming callbacks</h2>
            {callbacks > upcoming.length ? (
              <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Next {upcoming.length} of {callbacks}
              </span>
            ) : (
              <Link href="/dashboard/leads" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
                My leads <ArrowUpRight className="w-3 h-3" />
              </Link>
            )}
          </header>

          {upcoming.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <CalendarClock className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing booked</p>
              <p className="text-xs text-slate-500 mt-1">
                Open a lead, write a note and set a reminder time — it shows up here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {upcoming.map((n) => {
                const due = n.callbackAt as Date;
                return (
                  <li key={n.id}>
                    <Link
                      href={`/dashboard/leads?lead=${n.contactId}`}
                      className="block px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {n.contact.name || n.contact.phone}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            {n.contact.phone} ·{' '}
                            {due.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium tabular-nums bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                          {untilNow(due, now)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">{n.body}</p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent calls on your leads</h2>
            <Link href="/dashboard/calls" className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1">
              All calls <ArrowUpRight className="w-3 h-3" />
            </Link>
          </header>

          {recent.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No calls yet</p>
              <p className="text-xs text-slate-500 mt-1">
                {assigned === 0
                  ? 'No leads have been assigned to you yet. Ask your administrator.'
                  : 'Your assigned leads have not been called yet.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-white/[0.06]">
              {recent.map((c) => (
                <li key={c.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {c.contact?.name || c.phone}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {new Date(c.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className={cn(
                      'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium',
                      c.leadStatus === LeadStatus.interested
                        ? 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'
                    )}>
                      {c.leadStatus.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {c.summary && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2">{c.summary}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
