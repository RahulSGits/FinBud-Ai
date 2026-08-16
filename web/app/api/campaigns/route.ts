import { NextRequest, NextResponse } from 'next/server';
import { CallStatus, CampaignStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { assertOwner, errorResponse, isAdmin, requireCompany, visibleCampaigns } from '@/lib/authz';
import { parseBusinessHours } from '@/lib/campaigns/business-hours';

// Create/read/update/delete only. Every status transition (draft -> running ->
// paused -> completed) belongs to POST /api/campaigns/[id]/control, which also
// checks the agent, the provider and the remaining contacts before flipping a
// campaign to running. Nothing here may write Campaign.status.

/** Round-trip businessHours through the same parser the runner uses. */
function businessHoursJson(raw: unknown): Prisma.InputJsonValue | null {
  const hours = parseBusinessHours(raw);
  if (!hours) return null;
  // Rebuilt as a literal rather than passed straight through, so a client can't
  // smuggle extra keys into the column.
  return { tz: hours.tz, days: hours.days, start: hours.start, end: hours.end };
}

function toDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function toInt(raw: unknown, fallback: number, lo: number, hi: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(n, hi));
}

export async function GET() {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const campaigns = await db.campaign.findMany({
    where: visibleCampaigns(user),
    orderBy: { createdAt: 'desc' },
    include: {
      agent: { select: { id: true, name: true, isActive: true } },
      createdBy: { select: { name: true } },
      _count: { select: { contacts: true, calls: true } },
    },
  });

  // Per-campaign progress, computed in two grouped queries rather than N+1.
  const [interested, inFlight] = await Promise.all([
    db.call.groupBy({ by: ['campaignId'], where: { interested: true }, _count: true }),
    db.call.groupBy({ by: ['campaignId'], where: { status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress] } }, _count: true }),
  ]);
  const interestedBy = new Map(interested.map((r) => [r.campaignId, r._count]));
  const liveBy = new Map(inFlight.map((r) => [r.campaignId, r._count]));

  return NextResponse.json(campaigns.map((c) => ({
    ...c,
    totalContacts: c._count.contacts,
    totalCalls: c._count.calls,
    interestedCount: interestedBy.get(c.id) ?? 0,
    liveCalls: liveBy.get(c.id) ?? 0,
  })));
}

export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  if (!String(body.name ?? '').trim()) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
  if (!body.agentId) return NextResponse.json({ error: 'Select an agent' }, { status: 400 });

  const agent = await db.agent.findUnique({ where: { id: body.agentId } });
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

  const companyId = requireCompany(user);
  const hours = businessHoursJson(body.businessHours);

  const campaign = await db.campaign.create({
    data: {
      name: String(body.name).trim(),
      agentId: body.agentId,
      createdById: user.id,
      companyId,
      status: CampaignStatus.draft,
      concurrency: toInt(body.concurrency, 1, 1, 50),
      dailyCallLimit: body.dailyCallLimit ? toInt(body.dailyCallLimit, 1, 1, 100_000) : null,
      retryLimit: toInt(body.retryLimit, 1, 0, 10),
      retryDelayMins: toInt(body.retryDelayMins, 60, 1, 10_080),
      businessHours: hours ?? Prisma.DbNull,
      scheduledAt: toDate(body.scheduledAt),
    },
  });

  // Attach existing unassigned contacts, or specific ids.
  //
  // Both paths are restricted to the caller's own leads unless they are an
  // admin: otherwise any employee could sweep the whole company's contact book
  // into a campaign of their own and start dialling it.
  const mine = isAdmin(user) ? {} : { assignedToId: user.id };

  let attached = 0;
  if (Array.isArray(body.contactIds) && body.contactIds.length) {
    const res = await db.contact.updateMany({
      where: { ...mine, id: { in: body.contactIds } },
      data: { campaignId: campaign.id },
    });
    attached += res.count;
  }
  if (body.attachUnassigned === true) {
    // Runs after contactIds so a contact named in both is only counted once.
    const res = await db.contact.updateMany({
      where: { ...mine, campaignId: null },
      data: { campaignId: campaign.id },
    });
    attached += res.count;
  }

  await db.auditLog.create({
    data: { action: 'campaign.created', entity: 'Campaign', entityId: campaign.id, userId: user.id, meta: { attached } },
  });
  return NextResponse.json({ ...campaign, attached }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const data: Prisma.CampaignUncheckedUpdateInput = {};

  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Campaign name is required' }, { status: 400 });
    data.name = name;
  }
  if (body.agentId !== undefined) {
    const agent = await db.agent.findUnique({ where: { id: String(body.agentId) }, select: { id: true } });
    if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    data.agentId = agent.id;
  }
  if (body.concurrency !== undefined) data.concurrency = toInt(body.concurrency, 1, 1, 50);
  if (body.dailyCallLimit !== undefined) data.dailyCallLimit = body.dailyCallLimit ? toInt(body.dailyCallLimit, 1, 1, 100_000) : null;
  if (body.retryLimit !== undefined) data.retryLimit = toInt(body.retryLimit, 1, 0, 10);
  if (body.retryDelayMins !== undefined) data.retryDelayMins = toInt(body.retryDelayMins, 60, 1, 10_080);
  if (body.businessHours !== undefined) data.businessHours = businessHoursJson(body.businessHours) ?? Prisma.DbNull;
  if (body.scheduledAt !== undefined) data.scheduledAt = toDate(body.scheduledAt);

  const existing = await db.campaign.findUnique({
    where: { id: String(body.id) },
    select: { id: true, createdById: true },
  });
  if (!existing) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  try {
    assertOwner(user, existing.createdById, 'campaigns');
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  const campaign = await db.campaign.update({ where: { id: existing.id }, data });

  let attached = 0;
  if (body.attachUnassigned === true) {
    const res = await db.contact.updateMany({
      where: { ...(isAdmin(user) ? {} : { assignedToId: user.id }), campaignId: null },
      data: { campaignId: campaign.id },
    });
    attached = res.count;
  }

  return NextResponse.json({ ...campaign, attached });
}

export async function DELETE(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  try {
    assertOwner(user, campaign.createdById, 'campaigns');
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  if (campaign.status === CampaignStatus.running) {
    return NextResponse.json({ error: 'Stop the campaign before deleting it.' }, { status: 409 });
  }

  await db.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
