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
 * The one misconfiguration everyone hits on a first deploy: copying the local
 * .env into the host, so DATABASE_URL points at a loopback address the
 * deployed app can never reach. Detect it and say so, because the generic
 * failure ("Server error" at login) gives no clue that the fix is an
 * environment variable.
 */
export function dbUnreachableMessage(): string {
  let host = '';
  try {
    host = new URL(process.env.DATABASE_URL ?? '').hostname;
  } catch {
    /* unparseable or unset — the generic message covers it */
  }

  const loopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  const deployed = !!process.env.VERCEL || process.env.NODE_ENV === 'production';

  if (loopback && deployed) {
    return (
      'The database is unreachable: DATABASE_URL points at ' + host + ', which is the ' +
      'server itself — a deployed app cannot reach a database running on your laptop. ' +
      'Set DATABASE_URL and DIRECT_URL to a hosted Postgres (e.g. Supabase) in your ' +
      'deployment environment variables, then redeploy.'
    );
  }
  return 'The database is unreachable. Check DATABASE_URL, and that the database is running.';
}
