import { NextRequest, NextResponse } from 'next/server';
import { CampaignStatus, ContactStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { assertOwner, errorResponse } from '@/lib/authz';
import { tickCampaign } from '@/lib/campaigns/runner';
import { describeWindow, isWithinBusinessHours, parseBusinessHours } from '@/lib/campaigns/business-hours';
import { getProvider, isMockMode } from '@/lib/providers';

export const maxDuration = 60;

type Action = 'start' | 'pause' | 'resume' | 'stop';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
  if (!action || !['start', 'pause', 'resume', 'stop'].includes(action)) {
    return NextResponse.json({ error: 'action must be start, pause, resume or stop' }, { status: 400 });
  }

  const campaign = await db.campaign.findUnique({ where: { id: params.id }, include: { agent: true } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  // Starting a campaign spends money, so only its owner (or an admin) may drive
  // its state machine.
  try {
    assertOwner(user, campaign.createdById, 'campaigns');
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  if (action === 'pause') {
    if (campaign.status !== CampaignStatus.running) {
      return NextResponse.json({ error: `Cannot pause a ${campaign.status} campaign` }, { status: 409 });
    }
    const c = await db.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.paused } });
    return NextResponse.json({ ok: true, status: c.status, note: 'Calls already in progress will finish.' });
  }

  if (action === 'stop') {
    const c = await db.campaign.update({
      where: { id: campaign.id },
      data: { status: CampaignStatus.completed, completedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status: c.status });
  }

  if (campaign.status === CampaignStatus.running) {
    return NextResponse.json({ error: 'Campaign is already running' }, { status: 409 });
  }

  // Refuse to "start" something that cannot dial, rather than flipping it to
  // running and silently doing nothing.
  const dialable = await db.contact.count({
    where: { campaignId: campaign.id, status: { in: [ContactStatus.pending, ContactStatus.retry] } },
  });
  if (dialable === 0) {
    return NextResponse.json({ error: 'No contacts left to call. Add contacts first.' }, { status: 409 });
  }
  if (!campaign.agent.isActive) {
    return NextResponse.json({ error: `Agent "${campaign.agent.name}" is not active.` }, { status: 409 });
  }

  // Verify the agent's chosen engine can actually place calls before flipping
  // the campaign to running.
  const provider = getProvider(campaign.agent.voiceProvider);
  if (!isMockMode() && !(await provider.isConfigured())) {
    return NextResponse.json(
      { error: `${provider.name} is not configured. Add its credentials, or set USE_MOCK_CALLS=true to simulate.` },
      { status: 503 }
    );
  }

  const total = await db.contact.count({ where: { campaignId: campaign.id } });
  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: CampaignStatus.running,
      startedAt: campaign.startedAt ?? new Date(),
      completedAt: null,
      createdById: campaign.createdById ?? user.id,
    },
  });

  await db.auditLog.create({
    data: { action: `campaign.${action}`, entity: 'Campaign', entityId: campaign.id, userId: user.id, meta: { total } },
  });

  // Dial immediately so the user sees movement instead of waiting for a tick.
  const result = await tickCampaign(campaign.id);

  const hours = parseBusinessHours(campaign.businessHours);
  const outside = !isWithinBusinessHours(hours);

  return NextResponse.json({
    ok: true,
    status: result.status,
    dialled: result.dialled,
    failed: result.failed,
    remaining: result.remaining,
    mock: isMockMode(),
    notice: outside
      ? `Running, but outside calling hours (${describeWindow(hours)}). Dialling resumes automatically.`
      : result.skipped,
  });
}
