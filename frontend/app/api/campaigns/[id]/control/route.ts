import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { db } from '@/lib/db';
import { describeWindow, isWithinBusinessHours, parseBusinessHours } from '@/lib/campaigns/business-hours';
import { tickCampaign } from '@/lib/campaigns/runner';

type Action = 'start' | 'pause' | 'resume' | 'stop';

/**
 * Campaign lifecycle control.
 * Body: { action: "start" | "pause" | "resume" | "stop" }
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
  if (!action || !['start', 'pause', 'resume', 'stop'].includes(action)) {
    return NextResponse.json({ error: 'action must be start, pause, resume or stop' }, { status: 400 });
  }

  const campaign = await db.campaign.findFirst({
    where: { id: params.id, organizationId: user.organizationId },
    include: { agent: true },
  });
  if (!campaign) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'pause') {
    if (campaign.status !== 'running') {
      return NextResponse.json({ error: `Cannot pause a ${campaign.status} campaign` }, { status: 409 });
    }
    const updated = await db.campaign.update({ where: { id: campaign.id }, data: { status: 'paused' } });
    // In-flight calls are left to finish naturally; only new dialling stops.
    return NextResponse.json({ ok: true, status: updated.status });
  }

  if (action === 'stop') {
    const updated = await db.campaign.update({
      where: { id: campaign.id },
      data: { status: 'completed', completedAt: new Date() },
    });
    return NextResponse.json({ ok: true, status: updated.status });
  }

  // start / resume
  if (campaign.status === 'running') {
    return NextResponse.json({ error: 'Campaign is already running' }, { status: 409 });
  }
  if (campaign.status === 'completed' && action === 'resume') {
    return NextResponse.json({ error: 'Campaign is already completed' }, { status: 409 });
  }

  const pending = await db.contact.count({
    where: { campaignId: campaign.id, status: { in: ['pending', 'retry'] } },
  });
  if (pending === 0) {
    return NextResponse.json({ error: 'No contacts left to call. Add contacts first.' }, { status: 409 });
  }

  if (!campaign.agent) {
    return NextResponse.json({ error: 'Campaign has no agent assigned' }, { status: 409 });
  }

  const total = await db.contact.count({ where: { campaignId: campaign.id } });

  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      status: 'running',
      totalContacts: total,
      startedAt: campaign.startedAt ?? new Date(),
      completedAt: null,
    },
  });

  // Dial immediately so the user sees movement rather than waiting for a tick.
  const result = await tickCampaign(campaign.id);

  const hours = parseBusinessHours(campaign.businessHours);
  const outsideHours = !isWithinBusinessHours(hours);

  return NextResponse.json({
    ok: true,
    status: result.status,
    dialled: result.dialled,
    remaining: result.remaining,
    // Surface why nothing dialled instead of looking silently broken.
    notice: outsideHours
      ? `Campaign is running but outside calling hours (${describeWindow(hours)}). Dialling resumes automatically.`
      : result.skipped,
  });
}
