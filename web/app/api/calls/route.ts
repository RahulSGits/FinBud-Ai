import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse, visibleCalls } from '@/lib/authz';
import { CallError, hangUp, placeCall, placeManualCall } from '@/lib/calls/place';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const { body, status } = errorResponse(e); return NextResponse.json(body, { status });
  }

  const campaignId = req.nextUrl.searchParams.get('campaignId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 200, 500);

  // Role scoping comes from lib/authz so it cannot drift from the rest of the
  // app: employees see calls on their own leads plus any they started.
  const where: Prisma.CallWhereInput = { ...visibleCalls(user) };
  if (campaignId) where.campaignId = campaignId;

  const calls = await db.call.findMany({
    where,
    orderBy: { startedAt: 'desc' },
    take: limit,
    include: {
      contact: { select: { id: true, name: true, assignedToId: true } },
      agent: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(calls);
}

/**
 * Dial now.
 *
 * Body is either `{ contactId, agentId? }` for a lead already in the CRM, or
 * `{ phone, name?, agentId? }` to dial a number typed by hand.
 */
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const { body, status } = errorResponse(e); return NextResponse.json(body, { status });
  }

  const body = await req.json().catch(() => ({}));
  const contactId = typeof body.contactId === 'string' ? body.contactId.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const name = typeof body.name === 'string' ? body.name : null;
  const agentId = typeof body.agentId === 'string' && body.agentId.trim() ? body.agentId.trim() : null;

  // Exactly one of the two. A payload carrying both is ambiguous about which
  // number was meant, and dialling the wrong person is not undoable.
  if (contactId && phone) {
    return NextResponse.json({ error: 'Send either contactId or phone, not both' }, { status: 400 });
  }
  if (!contactId && !phone) {
    return NextResponse.json({ error: 'contactId or phone is required' }, { status: 400 });
  }

  try {
    const result = phone
      ? await placeManualCall({ user, phone, name, agentId })
      : await placeCall({ user, contactId, agentId });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    if (e instanceof CallError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('placeCall failed:', e);
    return NextResponse.json({ error: 'Could not place the call' }, { status: 500 });
  }
}

/** Hang up an in-flight call. Body: { id } */
export async function PATCH(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const { body, status } = errorResponse(e); return NextResponse.json(body, { status });
  }

  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  try {
    await hangUp(user, String(body.id));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof CallError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('hangUp failed:', e);
    return NextResponse.json({ error: 'Could not end the call' }, { status: 500 });
  }
}
