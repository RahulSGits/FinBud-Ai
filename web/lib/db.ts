import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/**
 * Pool sizing, applied here rather than left to whoever pasted the URL.
 *
 * Prisma's default pool is `num_cpus * 2 + 1` — three connections on a
 * single-core serverless instance. Pages here deliberately fan out a dozen or
 * more queries in one `Promise.all`, so on a small pool they queue four deep,
 * and against a database in another region each wave costs a full round trip.
 * That turned the admin pages into eleven-second renders that intermittently
 * exceeded the pool timeout and 500'd.
 *
 * Ten concurrent connections is comfortable against Supabase's defaults (pool
 * size 15, 200 max clients) and collapses those waves into one. An explicit
 * value in the URL always wins — this only fills in what is missing.
 */
function tunedUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '10');
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '20');
    return url.toString();
  } catch {
    // Unparseable URLs are Prisma's problem to report, not ours to mangle.
    return raw;
  }
}

function client(): PrismaClient {
  const url = tunedUrl();
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}

export const db = globalForPrisma.prisma || client();

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

  // 0. A password containing URL-reserved characters, pasted unencoded.
  //
  // Checked before the deployment branch because it is equally wrong locally,
  // and because it is invisible: the string *looks* like a correct connection
  // string. An unencoded `@` ends the userinfo section early, so everything
  // after it is read as the host — `…:p@ss@host:5432/db` resolves to a host of
  // `ss`, and Postgres is dialled at an address that does not exist. A `#`
  // starts a URL fragment and silently discards the rest, port and database
  // included.
  //
  // Cost a production outage here, twice, and the generic message sent the
  // reader off to check the database instead of the string.
  const raw = process.env.DATABASE_URL ?? '';
  const afterScheme = raw.replace(/^[a-z+]+:\/\//i, '');
  const userinfo = afterScheme.split('@').slice(0, -1).join('@');
  const looksMangled =
    // More than one `@` before the host means one of them is inside the password.
    afterScheme.split('@').length > 2 ||
    // A `#` anywhere truncates the URL at that point.
    raw.includes('#') ||
    // A host that is bare digits is the classic symptom of the split above.
    /^\d+$/.test(host);

  if (raw && looksMangled) {
    return (
      'The database is unreachable: DATABASE_URL cannot be parsed, which almost always means the ' +
      'password contains characters that are special in a URL. Percent-encode them — @ becomes ' +
      '%40, # becomes %23, $ becomes %24, / becomes %2F — or the address after the password is ' +
      `read as the hostname${host ? ` (it currently parses to "${host}")` : ''}. Update DATABASE_URL ` +
      'and DIRECT_URL in your deployment environment variables, then redeploy.'
    );
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
