import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse, visibleAgents } from '@/lib/authz';

/** One agent, for the edit screen. Writes go through /api/agents (PATCH). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  // Scoped, not a bare findUnique: an employee may open active agents and their
  // own drafts, but another rep's unpublished draft — its prompts, transfer
  // number, model choices — must read as "not found", exactly like the list.
  const agent = await db.agent.findFirst({
    where: { id: params.id, ...visibleAgents(user) },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { calls: true, campaigns: true } },
    },
  });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  return NextResponse.json(agent);
}
