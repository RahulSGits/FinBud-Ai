import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;

/** True when this error means "could not reach Postgres at all". */
export function isDbUnreachable(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientInitializationError) return true;
  return (e as { code?: string } | null)?.code === 'P1001';
}

/**
 * True when the query never ran because Prisma's own pool was saturated.
 *
 * Distinct from unreachable: the database is fine, the connection budget is
 * not. Several pages fan out a dozen queries in one `Promise.all`, so a
 * `connection_limit` of 1 or 2 makes them serialise and time out — the URL
 * looks right, the database is up, and the page still 500s.
 */
export function isPoolExhausted(e: unknown): boolean {
  const message = e instanceof Error ? e.message : '';
  return (e as { code?: string } | null)?.code === 'P2024' || /connection pool/i.test(message);
}

/** What to do about a saturated pool, naming the setting that causes it. */
export function poolExhaustedMessage(): string {
  const limit = /[?&]connection_limit=(\d+)/.exec(process.env.DATABASE_URL ?? '')?.[1];
  return (
    'The database is reachable, but the connection pool was exhausted before the query could ' +
    `run${limit ? ` (connection_limit=${limit})` : ''}. Several pages issue a dozen queries at ` +
    'once, so raise connection_limit in DATABASE_URL — 10 with pool_timeout=20 is a good ' +
    'starting point behind a transaction pooler.'
  );
}

/**
 * Name the actual cause of an unreachable database.
 *
 * "Check DATABASE_URL" is useless when the URL looks perfectly correct, which
 * is the case for both misconfigurations below. Each cost real debugging time
 * here, so each gets diagnosed by name.
 */
export function dbUnreachableMessage(): string {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    /* unparseable or unset — the generic message covers it */
  }

  const deployed = !!process.env.VERCEL || process.env.NODE_ENV === 'production';
  if (!deployed) {
    return 'The database is unreachable. Check DATABASE_URL, and that the database is running.';
  }

  // 1. The local .env copied verbatim into the host.
  if (host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    return (
      `The database is unreachable: DATABASE_URL points at ${host}, which is the server ` +
      'itself — a deployed app cannot reach a database running on your laptop. Set ' +
      'DATABASE_URL and DIRECT_URL to a hosted Postgres in your deployment environment ' +
      'variables, then redeploy.'
    );
  }

  // 2. Supabase's *direct* host. It publishes only an AAAA record, and Vercel
  // functions have no IPv6 route, so this address can never connect from here
  // however correct the credentials are. The pooler is IPv4 and is the fix.
  const supabaseDirect = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host);
  if (supabaseDirect) {
    return (
      `The database is unreachable: ${host} is Supabase's direct connection, which resolves ` +
      'to IPv6 only, and this platform cannot route IPv6 — so it can never connect, even ' +
      'with the right password. Use the Transaction pooler URI instead (Supabase → Project ' +
      'Settings → Database → Connection string → Transaction pooler): host ' +
      `aws-<n>-<region>.pooler.supabase.com, port 6543, user postgres.${supabaseDirect[1]}, ` +
      'plus ?pgbouncer=true&connection_limit=1. Keep the direct URI for DIRECT_URL, which is ' +
      'only used by migrations run from your own machine.'
    );
  }

  return 'The database is unreachable. Check DATABASE_URL, and that the database is running.';
}
