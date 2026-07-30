import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';

/** One agent, for the edit screen. Writes go through /api/agents (PATCH). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try { await requireUser(); } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const agent = await db.agent.findUnique({
    where: { id: params.id },
    include: { _count: { select: { calls: true, campaigns: true } } },
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  return NextResponse.json(agent);
}
