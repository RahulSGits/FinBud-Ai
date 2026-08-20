import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CompanyStatus } from '@prisma/client';
import {
  Activity, AlertTriangle, ArrowUpRight, Building2, Clock, PhoneCall, Plus, Users,
} from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { CompanyStatusBadge } from '@/components/platform/company-status-badge';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

/** A usage figure that has a ceiling, and how close it is to it. */
interface Pressure {
  company: { id: string; name: string; status: CompanyStatus };
  label: string;
  used: number;
  limit: number;
  pct: number;
}

export default async function PlatformOverview() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  // One grouped query per model rather than a count per company. This page is
  // the platform's front door: it must not get slower as tenants are added,
  // which a per-company loop would guarantee.
  const [companies, userRows, agentRows, contactRows, callRows, minuteRows, callsToday, recent] =
    await Promise.all([
      db.company.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
      db.user.groupBy({ by: ['companyId'], _count: true }),
      db.agent.groupBy({ by: ['companyId'], _count: true }),
      db.contact.groupBy({ by: ['companyId'], _count: true }),
      db.call.groupBy({ by: ['companyId'], _count: true }),
      db.call.groupBy({ by: ['companyId'], _sum: { durationSec: true } }),
      db.call.count({ where: { startedAt: { gte: startOfDay } } }),
      db.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { user: { select: { name: true } } },
      }),
    ]);

  const count = (rows: { companyId: string | null; _count: number }[]) =>
    new Map(rows.map((r) => [r.companyId, r._count]));
  const users = count(userRows);
  const agents = count(agentRows);
  const contacts = count(contactRows);
  const calls = count(callRows);
  // Rounded up per company, not once at the end: a part-minute still costs a
  // minute upstream, and summing seconds first would give every tenant the
  // benefit of everyone else's rounding.
  const minutes = new Map(
    minuteRows.map((r) => [r.companyId, Math.ceil((r._sum.durationSec ?? 0) / 60)])
  );

  const sum = (m: Map<string | null, number>) =>
    Array.from(m.values()).reduce((a, b) => a + b, 0);

  const active = companies.filter((c) => c.status === CompanyStatus.active).length;
  const pending = companies.filter((c) => c.status === CompanyStatus.pending).length;
  const suspended = companies.filter((c) => c.status === CompanyStatus.suspended).length;

  // Who is close to a ceiling. Only companies with a limit set appear: a null
  // limit means "no ceiling", and treating that as 0 would report every
  // unlimited customer as permanently over.
  const pressures: Pressure[] = [];
  for (const co of companies) {
    const checks: [string, number, number | null][] = [
      ['users', users.get(co.id) ?? 0, co.maxUsers],
      ['agents', agents.get(co.id) ?? 0, co.maxAgents],
      ['contacts', contacts.get(co.id) ?? 0, co.maxContacts],
      ['call minutes', minutes.get(co.id) ?? 0, co.maxCallMinutes],
    ];
    for (const [label, used, limit] of checks) {
      if (limit == null || limit <= 0) continue;
      const pct = Math.round((used / limit) * 100);
      if (pct >= 80) {
        pressures.push({ company: { id: co.id, name: co.name, status: co.status }, label, used, limit, pct });
      }
    }
  }
  pressures.sort((a, b) => b.pct - a.pct);

  const stats = [
    {
      label: 'Companies',
      value: `${active}/${companies.length}`,
      hint: 'active',
      icon: Building2,
      tone: 'text-brand-500 bg-brand-500/10',
    },
    { label: 'People', value: String(sum(users)), hint: 'across all tenants', icon: Users, tone: 'text-sky-500 bg-sky-500/10' },
    { label: 'Calls today', value: String(callsToday), hint: `${sum(calls)} all time`, icon: PhoneCall, tone: 'text-blue-500 bg-blue-500/10' },
    { label: 'Call minutes', value: String(sum(minutes)), hint: 'billable, all time', icon: Clock, tone: 'text-amber-500 bg-amber-500/10' },
  ];

  return (
    <>
      <PageHeader
        title="Platform"
        subtitle={
          [
            `${companies.length} ${companies.length === 1 ? 'company' : 'companies'}`,
            pending ? `${pending} awaiting approval` : null,
            suspended ? `${suspended} suspended` : null,
          ]
            .filter(Boolean)
            .join(' · ')
        }
        action={
          <Link
            href="/platform/companies"
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" /> New company
          </Link>
        }
      />

      <div className="px-6 pb-10 space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4"
            >
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', s.tone)}>
                <s.icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">{s.value}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{s.hint}</div>
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-2 gap-4">
          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Approaching a limit</h2>
              </div>
              <Link
                href="/platform/companies"
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                All companies <ArrowUpRight className="w-3 h-3" />
              </Link>
            </header>

            {pressures.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Nobody is near a ceiling
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Companies appear here once any usage reaches 80% of a limit you have set.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {pressures.slice(0, 6).map((p) => (
                  <li key={`${p.company.id}-${p.label}`}>
                    <Link
                      href={`/platform/companies/${p.company.id}`}
                      className="group flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                          {p.company.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {p.used.toLocaleString()} / {p.limit.toLocaleString()} {p.label}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums',
                          p.pct >= 100
                            ? 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400'
                            : 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        )}
                      >
                        {p.pct}%
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
            <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-brand-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent activity</h2>
              </div>
              <Link
                href="/platform/audit"
                className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
              >
                Full log <ArrowUpRight className="w-3 h-3" />
              </Link>
            </header>

            {recent.length === 0 ? (
              <div className="px-5 py-10 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing recorded yet</p>
                <p className="text-xs text-slate-500 mt-1">Actions across every company land here.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                {recent.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {e.action}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {e.user?.name ?? 'System'} · {e.entity}
                      </p>
                    </div>
                    <time
                      dateTime={e.createdAt.toISOString()}
                      className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums"
                    >
                      {e.createdAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Companies</h2>
            <Link
              href="/platform/companies"
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Manage <ArrowUpRight className="w-3 h-3" />
            </Link>
          </header>

          <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
            {companies.slice(0, 8).map((co) => (
              <li key={co.id}>
                <Link
                  href={`/platform/companies/${co.id}`}
                  className="group flex items-center gap-4 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                      {co.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {co.plan ?? 'No plan'} · {co.slug}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
                    {[
                      ['people', users.get(co.id) ?? 0],
                      ['calls', calls.get(co.id) ?? 0],
                      ['minutes', minutes.get(co.id) ?? 0],
                    ].map(([label, value]) => (
                      <div key={label as string}>
                        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                          {(value as number).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
                      </div>
                    ))}
                  </div>
                  <CompanyStatusBadge status={co.status} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
