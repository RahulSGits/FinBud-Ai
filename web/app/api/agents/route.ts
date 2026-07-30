import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { assertOwner, errorResponse, visibleAgents } from '@/lib/authz';
import { syncAgent, unsyncAgent } from '@/lib/providers/sync';

const FIELDS = [
  'name', 'description', 'firstMessage', 'systemPrompt', 'businessContext',
  'callObjective', 'qualificationRules', 'objectionHandling', 'complianceRules',
  'closingScript', 'llmModel', 'sttModel', 'ttsModel', 'voiceId', 'language',
  'voiceProvider',
] as const;

function pick(body: any) {
  const out: Record<string, any> = {};
  for (const f of FIELDS) if (body[f] !== undefined) out[f] = body[f];
  if (body.isActive !== undefined) out.isActive = !!body.isActive;
  if (body.transferEnabled !== undefined) out.transferEnabled = !!body.transferEnabled;
  if (body.transferNumber !== undefined) out.transferNumber = body.transferNumber || null;
  if (body.useKnowledgeBase !== undefined) out.useKnowledgeBase = !!body.useKnowledgeBase;
  return out;
}

export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const agents = await db.agent.findMany({
    where: visibleAgents(user),
    orderBy: { updatedAt: 'desc' },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { calls: true, campaigns: true } },
    },
  });
  return NextResponse.json(agents);
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  if (!String(body.name ?? '').trim()) {
    return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
  }

  const data = pick(body);
  const agent = await db.agent.create({
    data: { ...data, name: String(body.name).trim(), createdById: user.id },
  });

  await db.auditLog.create({
    data: { action: 'agent.created', entity: 'Agent', entityId: agent.id, userId: user.id },
  });

  // Push to the execution engine. Non-fatal: a sync failure is recorded and
  // surfaced, but never loses the agent the user just authored.
  const sync = await syncAgent(agent.id);
  const fresh = await db.agent.findUnique({ where: { id: agent.id } });
  return NextResponse.json({ ...fresh, syncError: sync.error ?? null }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await db.agent.findUnique({ where: { id: body.id } });
  if (!existing) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  try {
    assertOwner(user, existing.createdById, 'agents');
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  const agent = await db.agent.update({ where: { id: body.id }, data: pick(body) });
  await db.auditLog.create({
    data: { action: 'agent.updated', entity: 'Agent', entityId: agent.id, userId: user.id },
  });

  // Live synchronisation: every edit is pushed to the engine immediately, so
  // future calls use the new voice / prompt / language.
  const sync = await syncAgent(agent.id);
  const fresh = await db.agent.findUnique({ where: { id: agent.id } });
  return NextResponse.json({ ...fresh, syncError: sync.error ?? null });
}

export async function DELETE(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const owner = await db.agent.findUnique({ where: { id }, select: { createdById: true } });
  if (!owner) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  try {
    assertOwner(user, owner.createdById, 'agents');
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  // Campaigns reference agents with onDelete: Restrict, so explain rather than
  // surfacing a raw foreign-key error.
  const campaigns = await db.campaign.count({ where: { agentId: id } });
  if (campaigns > 0) {
    return NextResponse.json(
      { error: `This agent is used by ${campaigns} campaign(s). Delete those first.` },
      { status: 409 }
    );
  }

  const agent = await db.agent.findUnique({ where: { id } });
  if (agent) await unsyncAgent(agent);   // best-effort remove from the engine

  await db.agent.delete({ where: { id } });
  await db.auditLog.create({ data: { action: 'agent.deleted', entity: 'Agent', entityId: id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
