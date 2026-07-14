import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Health check for uptime monitors / load balancers.
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'down', time: new Date().toISOString() }, { status: 503 });
  }
}
