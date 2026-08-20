import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { CompanyStatusBadge } from '@/components/platform/company-status-badge';
import { CompanySettings } from '@/components/platform/company-settings';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  const company = await db.company.findUnique({ where: { id: params.id } });
  if (!company) notFound();

  const [users, agents, contacts, calls, campaigns, minutes, people, recentCalls] =
    await Promise.all([
      db.user.count({ where: { companyId: company.id } }),
      db.agent.count({ where: { companyId: company.id } }),
      db.contact.count({ where: { companyId: company.id } }),
      db.call.count({ where: { companyId: company.id } }),
      db.campaign.count({ where: { companyId: company.id } }),
      db.call.aggregate({ where: { companyId: company.id }, _sum: { durationSec: true } }),
      db.user.findMany({
        where: { companyId: company.id },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true, name: true, email: true, role: true, status: true,
          lastLoginAt: true, mustChangePassword: true,
        },
      }),
      db.call.findMany({
        where: { companyId: company.id },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { id: true, phone: true, status: true, durationSec: true, startedAt: true },
      }),
    ]);

  // Rounded up: a part-minute still costs a minute upstream.
  const callMinutes = Math.ceil((minutes._sum.durationSec ?? 0) / 60);

  const usage: [string, number, number | null][] = [
    ['People', users, company.maxUsers],
    ['Agents', agents, company.maxAgents],
    ['Campaigns', campaigns, company.maxCampaigns],
    ['Contacts', contacts, company.maxContacts],
    ['Calls', calls, null],
    ['Call minutes', callMinutes, company.maxCallMinutes],
  ];

  return (
    <>
      <PageHeader
        title={company.name}
        subtitle={`${company.slug} · joined ${company.createdAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        action={
          <div className="flex items-center gap-2">
            <CompanyStatusBadge status={company.status} className="self-center" />
            <Link
              href="/platform/companies"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl border border-slate-200 dark:border-white/10 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" /> All companies
            </Link>
          </div>
        }
      />

      <div className="px-6 pb-12 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {usage.map(([label, used, limit]) => {
            // A null limit is no ceiling, never "zero remaining" — the whole
            // point of storing it nullable.
            const pct = limit != null && limit > 0 ? Math.round((used / limit) * 100) : null;
            return (
              <div
                key={label}
                className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4"
              >
                <div className="text-xl font-bold tabular-nums text-slate-900 dark:text-white">
                  {used.toLocaleString()}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{label}</div>
                {limit == null ? (
                  <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">No limit</div>
                ) : (
                  <>
                    <div className="mt-2 h-1 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full',
                          (pct ?? 0) >= 100 ? 'bg-red-500' : (pct ?? 0) >= 80 ? 'bg-amber-500' : 'bg-brand-500'
                        )}
                        style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 tabular-nums">
                      {pct}% of {limit.toLocaleString()}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <CompanySettings
              company={{
                id: company.id,
                name: company.name,
                status: company.status,
                plan: company.plan,
                maxUsers: company.maxUsers,
                maxAgents: company.maxAgents,
                maxCampaigns: company.maxCampaigns,
                maxContacts: company.maxContacts,
                maxCallsPerDay: company.maxCallsPerDay,
                maxCallMinutes: company.maxCallMinutes,
                maxConcurrent: company.maxConcurrent,
              }}
            />
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Who they are</h2>
              </header>
              <dl className="px-5 py-4 space-y-3 text-sm">
                {[
                  ['Contact', company.contactName],
                  ['Email', company.contactEmail],
                  ['Phone', company.contactPhone],
                  [
                    'Approved',
                    company.approvedAt
                      ? company.approvedAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      : null,
                  ],
                ].map(([label, value]) => (
                  <div key={label as string} className="flex items-start justify-between gap-4">
                    <dt className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{label}</dt>
                    <dd className="text-sm text-slate-900 dark:text-white text-right break-all">
                      {value || <span className="text-slate-400 dark:text-slate-600">—</span>}
                    </dd>
                  </div>
                ))}
              </dl>
              {company.requestNotes && (
                <div className="px-5 pb-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">What they asked for</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {company.requestNotes}
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Recent calls
                </h2>
              </header>
              {recentCalls.length === 0 ? (
                <p className="px-5 py-8 text-center text-xs text-slate-500">
                  This company has not placed a call yet.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
                  {recentCalls.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                      <span className="text-sm text-slate-900 dark:text-white tabular-nums">{c.phone}</span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {c.status.replace(/_/g, ' ')} · {c.durationSec}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              People ({people.length})
            </h2>
            <Link
              href="/admin/team"
              className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline inline-flex items-center gap-1"
            >
              Company team page <ExternalLink className="w-3 h-3" />
            </Link>
          </header>

          {people.length === 0 ? (
            <p className="px-5 py-8 text-center text-xs text-slate-500">
              Nobody can sign in to this company.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {people.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{p.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{p.email}</p>
                  </div>
                  {p.mustChangePassword && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400">
                      never signed in
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-slate-500 dark:text-slate-400 capitalize w-20">
                    {p.role.replace(/_/g, ' ')}
                  </span>
                  <span className="shrink-0 text-xs text-slate-400 dark:text-slate-500 w-24 text-right">
                    {p.lastLoginAt
                      ? p.lastLoginAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
                      : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
