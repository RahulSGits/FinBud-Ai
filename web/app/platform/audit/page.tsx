import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

/** Tint by what the action does, not by which model it touched. */
function tone(action: string): string {
  if (/\.(deleted|removed|suspended|revoked)$/.test(action)) {
    return 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400';
  }
  if (/\.(created|approved|activated)$/.test(action)) {
    return 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400';
  }
  return 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400';
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: { page?: string; company?: string; entity?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  // Clamped rather than trusted: a hand-typed page=-1 would make Prisma throw
  // on a negative skip, and a page far past the end should simply be empty.
  const page = Math.max(1, Number(searchParams.page) || 1);
  const companyId = searchParams.company || '';
  const entity = searchParams.entity || '';

  const where: Prisma.AuditLogWhereInput = {};
  // "platform" is the owner's own actions: approving a company, changing a
  // plan. Those genuinely belong to no tenant, which is why companyId is
  // nullable on this model alone.
  if (companyId === 'platform') where.companyId = null;
  else if (companyId) where.companyId = companyId;
  if (entity) where.entity = entity;

  const [entries, total, companies, entities] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { name: true, email: true } },
        tenant: { select: { id: true, name: true } },
      },
    }),
    db.auditLog.count({ where }),
    db.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    db.auditLog.groupBy({ by: ['entity'], _count: true, orderBy: { entity: 'asc' } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function href(next: Partial<{ page: number; company: string; entity: string }>): string {
    const p = new URLSearchParams();
    const c = next.company ?? companyId;
    const e = next.entity ?? entity;
    const pg = next.page ?? page;
    if (c) p.set('company', c);
    if (e) p.set('entity', e);
    if (pg > 1) p.set('page', String(pg));
    const q = p.toString();
    return q ? `/platform/audit?${q}` : '/platform/audit';
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle={`${total.toLocaleString()} ${total === 1 ? 'entry' : 'entries'} across every company`}
      />

      <div className="px-6 pb-10 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Filter
            label="Company"
            options={[
              { value: '', label: 'Everywhere' },
              { value: 'platform', label: 'Platform only' },
              ...companies.map((c) => ({ value: c.id, label: c.name })),
            ]}
            active={companyId}
            hrefFor={(v) => href({ company: v, page: 1 })}
          />
          <Filter
            label="Entity"
            options={[
              { value: '', label: 'All' },
              ...entities.map((e) => ({ value: e.entity, label: `${e.entity} (${e._count})` })),
            ]}
            active={entity}
            hrefFor={(v) => href({ entity: v, page: 1 })}
          />
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
          {entries.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <ScrollText className="w-5 h-5 mx-auto text-slate-400 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Nothing recorded</p>
              <p className="text-xs text-slate-500 mt-1">
                {total === 0 ? 'Actions appear here as they happen.' : 'No entries match these filters.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
              {entries.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium font-mono',
                      tone(e.action)
                    )}
                  >
                    {e.action}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 dark:text-white truncate">
                      {e.user?.name ?? 'System'}
                      <span className="text-slate-400 dark:text-slate-500"> · {e.entity}</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {e.tenant?.name ?? 'Platform'}
                      {e.meta ? ` · ${summarise(e.meta)}` : ''}
                    </p>
                  </div>
                  <time
                    dateTime={e.createdAt.toISOString()}
                    className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500 tabular-nums"
                  >
                    {e.createdAt.toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Page {page} of {pages}
            </p>
            <div className="flex items-center gap-2">
              <PageLink href={href({ page: page - 1 })} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4" /> Newer
              </PageLink>
              <PageLink href={href({ page: page + 1 })} disabled={page >= pages}>
                Older <ChevronRight className="w-4 h-4" />
              </PageLink>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * A one-line reading of an entry's meta.
 *
 * Deliberately shallow: meta is free-form JSON written by whichever handler
 * recorded the event, so anything that walks into it has to survive shapes
 * nobody here has seen.
 */
function summarise(meta: Prisma.JsonValue): string {
  if (typeof meta === 'string') return meta;
  if (Array.isArray(meta)) return meta.slice(0, 3).map(String).join(', ');
  if (meta && typeof meta === 'object') {
    return Object.entries(meta)
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v)}`)
      .join(' · ');
  }
  return '';
}

function Filter({
  label, options, active, hrefFor,
}: {
  label: string;
  options: { value: string; label: string }[];
  active: string;
  hrefFor: (value: string) => string;
}) {
  const current = options.find((o) => o.value === active) ?? options[0];
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] text-sm text-slate-700 dark:text-slate-200">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}:</span>
        {current.label}
      </summary>
      <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0b1220] shadow-lg p-1">
        {options.map((o) => (
          <Link
            key={o.value || '__all__'}
            href={hrefFor(o.value)}
            className={cn(
              'block px-3 py-1.5 rounded-lg text-sm truncate',
              o.value === active
                ? 'bg-brand-500/10 text-brand-700 dark:text-brand-400'
                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5'
            )}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function PageLink({
  href, disabled, children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className =
    'inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-slate-200 dark:border-white/10 text-xs font-medium';
  if (disabled) {
    return (
      <span className={cn(className, 'text-slate-300 dark:text-slate-600 cursor-not-allowed')}>
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className={cn(className, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5')}
    >
      {children}
    </Link>
  );
}
