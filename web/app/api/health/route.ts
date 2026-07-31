import { NextResponse } from 'next/server';
import { db, dbUnreachableMessage, isPoolExhausted, poolExhaustedMessage } from '@/lib/db';

// Health check for uptime monitors / load balancers.
//
// Must never be prerendered: the handler has no request-bound inputs, so Next
// would otherwise evaluate it once at build time and serve that frozen
// {status:'ok'} forever — including while the database is down, which is the
// one moment this endpoint exists for. It also makes the build require a
// reachable database.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (e) {
    // A saturated pool is not an unreachable database, and saying so sends you
    // to the wrong setting entirely.
    if (isPoolExhausted(e)) {
      return NextResponse.json(
        { status: 'degraded', db: 'pool-exhausted', hint: poolExhaustedMessage(), time: new Date().toISOString() },
        { status: 503 }
      );
    }
    return NextResponse.json(
      // The hint names the actual fix when DATABASE_URL points at localhost, or
      // at Supabase's IPv6-only direct host — the two causes of a permanently
      // "degraded" first deploy.
      { status: 'degraded', db: 'down', hint: dbUnreachableMessage(), time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
