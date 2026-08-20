import { redirect } from 'next/navigation';
import { CallStatus } from '@prisma/client';
import { AlertTriangle, CheckCircle2, Database, Info, Server, ShieldCheck, XCircle } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Level = 'ok' | 'warn' | 'bad';

interface Check {
  label: string;
  value: string;
  level: Level;
  detail?: string;
}

const TONE: Record<Level, string> = {
  ok: 'text-brand-600 dark:text-brand-400',
  warn: 'text-amber-600 dark:text-amber-400',
  bad: 'text-red-600 dark:text-red-400',
};

const ICON: Record<Level, typeof CheckCircle2> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  bad: XCircle,
};

/**
 * Environment variables that change behaviour if absent.
 *
 * Only their presence is reported. A page that printed any part of a secret
 * would turn the one screen the platform owner leaves open into the easiest
 * way to leak one.
 */
const ENV_CHECKS: { key: string; label: string; required: boolean }[] = [
  { key: 'DATABASE_URL', label: 'Database URL', required: true },
  { key: 'DIRECT_URL', label: 'Direct database URL (migrations)', required: false },
  { key: 'AUTH_SECRET', label: 'Session signing secret', required: true },
  { key: 'OMNIDIM_API_KEY', label: 'OmniDimension key (platform fallback)', required: false },
  { key: 'OPENAI_API_KEY', label: 'OpenAI key', required: false },
  { key: 'CRON_SECRET', label: 'Cron secret', required: false },
  { key: 'FINBUD_INTERNAL_SECRET', label: 'Internal webhook secret', required: false },
  { key: 'WHATSAPP_ACCESS_TOKEN', label: 'WhatsApp access token', required: false },
  { key: 'RESEND_API_KEY', label: 'Email (Resend) key', required: false },
];

export default async function HealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  // Every probe below is wrapped: a health page that throws when something is
  // unhealthy is the one page that must not, because that is exactly when
  // somebody opens it.
  async function probe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch {
      return null;
    }
  }

  const startedAt = Date.now();
  const reachable = await probe(() => db.$queryRaw`SELECT 1`);
  const latencyMs = Date.now() - startedAt;

  const [rls, policies, roleInfo, migrations, stuck, recentFailures] = await Promise.all([
    probe(
      () =>
        db.$queryRaw<{ enabled: number; total: number }[]>`
          SELECT count(*) FILTER (WHERE rowsecurity)::int AS enabled, count(*)::int AS total
          FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        `
    ),
    probe(
      () =>
        db.$queryRaw<{ count: number }[]>`
          SELECT count(*)::int AS count FROM pg_policies WHERE schemaname = 'public'
        `
    ),
    probe(
      () =>
        db.$queryRaw<{ role: string; bypassrls: boolean }[]>`
          SELECT current_user::text AS role,
                 COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS bypassrls
        `
    ),
    // Grouped by name, not listed by attempt. A migration that was rolled back
    // and then re-applied leaves both rows behind, and reading the attempts
    // reported a permanent red "1 rolled back" for a database that was in fact
    // up to date. What matters is whether each migration has *an* attempt that
    // finished and was not rolled back.
    probe(
      () =>
        db.$queryRaw<{ migration_name: string; applied: boolean; last_started: Date }[]>`
          SELECT migration_name,
                 bool_or(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS applied,
                 max(started_at) AS last_started
          FROM _prisma_migrations
          GROUP BY migration_name
          ORDER BY max(started_at) DESC
        `
    ),
    // Calls that never reached a terminal state. A handful is normal; a pile of
    // them means result reconciliation has stopped.
    probe(() =>
      db.call.count({
        where: {
          status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress] },
          startedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
        },
      })
    ),
    probe(() =>
      db.agent.count({ where: { syncError: { not: null } } })
    ),
  ]);

  const rlsRow = rls?.[0];
  const role = roleInfo?.[0];
  const unapplied = migrations?.filter((m) => !m.applied) ?? [];
  const latest = migrations?.find((m) => m.applied)?.migration_name ?? 'none';

  const database: Check[] = [
    {
      label: 'Connection',
      value: reachable ? `Reachable · ${latencyMs}ms` : 'Unreachable',
      level: reachable ? (latencyMs > 1000 ? 'warn' : 'ok') : 'bad',
      detail: reachable
        ? undefined
        : 'The application cannot query the database. Check DATABASE_URL and the pooler host.',
    },
    {
      label: 'Migrations',
      value:
        migrations == null
          ? 'Unknown'
          : unapplied.length
            ? `${unapplied.length} not applied`
            : `Up to date · ${latest}`,
      level: migrations == null ? 'warn' : unapplied.length ? 'bad' : 'ok',
      detail: unapplied.length ? unapplied.map((m) => m.migration_name).join(', ') : undefined,
    },
    {
      label: 'Stuck calls',
      value: stuck == null ? 'Unknown' : `${stuck} older than an hour`,
      level: stuck == null ? 'warn' : stuck === 0 ? 'ok' : stuck < 5 ? 'warn' : 'bad',
      detail:
        stuck && stuck > 0
          ? 'Calls still marked in-flight after an hour. Result reconciliation may have stopped.'
          : undefined,
    },
    {
      label: 'Agents out of sync',
      value: recentFailures == null ? 'Unknown' : `${recentFailures} with a sync error`,
      level: recentFailures == null ? 'warn' : recentFailures === 0 ? 'ok' : 'warn',
      detail:
        recentFailures && recentFailures > 0
          ? 'These agents failed to publish to the calling engine and will dial with stale settings.'
          : undefined,
    },
  ];

  const isolation: Check[] = [
    {
      label: 'Row level security',
      value: rlsRow ? `${rlsRow.enabled} of ${rlsRow.total} tables` : 'Unknown',
      level: !rlsRow ? 'warn' : rlsRow.enabled >= rlsRow.total ? 'ok' : 'warn',
    },
    {
      label: 'Policies',
      value: policies?.[0] ? `${policies[0].count} defined` : 'Unknown',
      level: !policies?.[0] ? 'warn' : policies[0].count > 0 ? 'ok' : 'bad',
      detail:
        policies?.[0] && policies[0].count === 0
          ? 'Security is enabled with no policies, which denies every row to everyone.'
          : undefined,
    },
    {
      label: 'Application database role',
      value: role ? `${role.role}${role.bypassrls ? ' · BYPASSRLS' : ''}` : 'Unknown',
      // Honest rather than flattering: while the app connects as a role that
      // bypasses RLS, the policies are a second line of defence and not the
      // one actually holding. Reporting this as green would be a lie the
      // platform owner acts on.
      level: !role ? 'warn' : role.bypassrls ? 'warn' : 'ok',
      detail: role?.bypassrls
        ? 'The application bypasses row level security, so tenant isolation currently rests on the query scopes in code. The policies are a backstop until the app connects as a NOBYPASSRLS role.'
        : undefined,
    },
  ];

  const environment: Check[] = ENV_CHECKS.map((e) => {
    const present = Boolean(process.env[e.key]);
    return {
      label: e.label,
      value: present ? 'Set' : e.required ? 'Missing' : 'Not set',
      level: present ? 'ok' : e.required ? 'bad' : 'warn',
    };
  });

  const worst: Level = [...database, ...isolation, ...environment].some((c) => c.level === 'bad')
    ? 'bad'
    : [...database, ...isolation, ...environment].some((c) => c.level === 'warn')
      ? 'warn'
      : 'ok';

  return (
    <>
      <PageHeader
        title="System health"
        subtitle={
          worst === 'ok'
            ? 'Everything reporting normally'
            : worst === 'warn'
              ? 'Running, with things worth looking at'
              : 'Something is broken'
        }
      />

      <div className="px-6 pb-10 space-y-6">
        <div className="grid lg:grid-cols-3 gap-4">
          <Panel title="Database" icon={Database} checks={database} />
          <Panel title="Tenant isolation" icon={ShieldCheck} checks={isolation} />
          <Panel title="Environment" icon={Server} checks={environment} />
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          Read fresh on every load. Only whether a secret is set is reported, never any part of its
          value.
        </p>
      </div>
    </>
  );
}

function Panel({
  title, icon: Icon, checks,
}: {
  title: string;
  icon: typeof Database;
  checks: Check[];
}) {
  return (
    <section className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden">
      <header className="flex items-center gap-2 px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <Icon className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
      </header>
      <ul className="divide-y divide-slate-100 dark:divide-white/[0.06]">
        {checks.map((c) => {
          const Mark = ICON[c.level];
          return (
            <li key={c.label} className="px-5 py-3">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm text-slate-700 dark:text-slate-300">{c.label}</span>
                <span className={cn('flex items-center gap-1.5 text-sm font-medium text-right', TONE[c.level])}>
                  <Mark className="w-3.5 h-3.5 shrink-0" />
                  {c.value}
                </span>
              </div>
              {c.detail && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">{c.detail}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
