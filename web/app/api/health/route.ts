import { NextResponse } from 'next/server';
import { db, dbUnreachableMessage } from '@/lib/db';

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
  } catch {
    return NextResponse.json(
      // The hint names the actual fix when DATABASE_URL points at localhost on
      // a deployed host — the most common cause of a permanently "degraded"
      // first deploy.
      { status: 'degraded', db: 'down', hint: dbUnreachableMessage(), time: new Date().toISOString() },
      { status: 503 }
    );
  }
}
