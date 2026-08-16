// Bulk calling from an arbitrary selection of contacts.
//
// There is deliberately no second dialling loop here. Bulk calling *is* a
// campaign: this route builds one over exactly the contacts the user picked,
// starts it, and hands the first tick to lib/campaigns/runner. Everything that
// makes bulk dialling safe — pacing, concurrency, retries, business hours,
// claim-before-dial, stale-call reaping, reporting through applyCallReport —
// already lives there and is reused verbatim.
import { NextRequest, NextResponse } from 'next/server';
import { CampaignStatus, ContactStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse, requireCompany, visibleAgents, visibleContacts } from '@/lib/authz';
import { describeWindow, isWithinBusinessHours, parseBusinessHours } from '@/lib/campaigns/business-hours';
import { tickCampaign, type TickResult } from '@/lib/campaigns/runner';
import { getProvider, isMockMode } from '@/lib/providers';
import { syncAgent } from '@/lib/providers/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * One request may not queue more than this.
 *
 * Not a limit on how many people can be called — the runner paces the whole
 * queue — but on how much work a single HTTP request commits to in one go.
 */
const MAX_CONTACTS = 500;

/** Statuses that must never be swept into a bulk run. */
const UNQUEUEABLE: ContactStatus[] = [ContactStatus.do_not_call, ContactStatus.calling];

function toInt(raw: unknown, fallback: number, lo: number, hi: number): number {
  if (raw === null || raw === undefined || raw === '') return fallback;
  const n = Math.trunc(Number(raw));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(n, hi));
}

/** Round-trip businessHours through the parser the runner itself uses. */
function businessHoursJson(raw: unknown): Prisma.InputJsonValue | null {
  const hours = parseBusinessHours(raw);
  if (!hours) return null;
  // Rebuilt as a literal so a client cannot smuggle extra keys into the column.
  return { tz: hours.tz, days: hours.days, start: hours.start, end: hours.end };
}

function defaultName(count: number): string {
  return `Bulk call — ${count} lead${count === 1 ? '' : 's'}`;
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body: err, status } = errorResponse(e);
    return NextResponse.json(err, { status });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const rawIds: unknown[] = Array.isArray(body.contactIds) ? body.contactIds : [];
  // Deduplicated: the same id twice must not queue the same person twice.
  const requestedIds = Array.from(
    new Set(rawIds.filter((v): v is string => typeof v === 'string' && v.trim() !== ''))
  );

  if (requestedIds.length === 0) {
    return NextResponse.json({ error: 'Select at least one contact to call.' }, { status: 400 });
  }
  if (requestedIds.length > MAX_CONTACTS) {
    return NextResponse.json(
      {
        error: `You can queue at most ${MAX_CONTACTS} contacts at a time — you selected ${requestedIds.length}. Start this batch, then queue the rest.`,
      },
      { status: 400 }
    );
  }

  // -------------------------------------------------------------------------
  // The agent. Refuse for the specific reason rather than a generic failure,
  // because each of these has a different fix.
  // -------------------------------------------------------------------------
  const agentId = typeof body.agentId === 'string' ? body.agentId.trim() : '';
  if (!agentId) {
    return NextResponse.json({ error: 'Choose an AI agent to run these calls.' }, { status: 400 });
  }

  const agent = await db.agent.findUnique({ where: { id: agentId } });
  if (!agent) return NextResponse.json({ error: 'Agent not found.' }, { status: 404 });

  const reachable = await db.agent.count({ where: { AND: [{ id: agent.id }, visibleAgents(user)] } });
  if (reachable === 0) {
    return NextResponse.json(
      { error: `"${agent.name}" is not one of the agents available to you.` },
      { status: 403 }
    );
  }
  if (!agent.isActive) {
    return NextResponse.json(
      { error: `"${agent.name}" is not active. Activate it before calling with it.` },
      { status: 409 }
    );
  }

  const provider = getProvider(agent.voiceProvider);
  if (!isMockMode() && !(await provider.isConfigured())) {
    return NextResponse.json(
      { error: `${provider.name} is not configured. Add its credentials, or set USE_MOCK_CALLS=true to simulate.` },
      { status: 503 }
    );
  }

  // Engines that hold their own agent resource cannot dial one they have never
  // been told about. Publishing it here turns "every call in the batch failed"
  // into one honest refusal naming the thing that actually needs fixing.
  if (!isMockMode() && provider.capabilities().serverAgents && !agent.externalAgentId) {
    const sync = await syncAgent(agent.id);
    if (!sync.synced || !sync.externalAgentId) {
      return NextResponse.json(
        {
          error: `"${agent.name}" could not be published to ${provider.name}, so nothing was dialled. ${sync.error ?? 'The sync failed.'}`,
        },
        { status: 502 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // The contacts. Scoped so an employee can only ever bulk-dial their own
  // leads, whatever ids the client sent.
  // -------------------------------------------------------------------------
  const eligible = await db.contact.findMany({
    where: { AND: [{ id: { in: requestedIds } }, visibleContacts(user)] },
    select: { id: true, status: true, campaignId: true },
  });

  const notEligible = requestedIds.length - eligible.length;
  const blocked = eligible.filter((c) => c.status === ContactStatus.do_not_call);
  const inProgress = eligible.filter((c) => c.status === ContactStatus.calling);
  const queueable = eligible.filter((c) => UNQUEUEABLE.indexOf(c.status) === -1);

  if (eligible.length === 0) {
    return NextResponse.json(
      {
        error:
          requestedIds.length === 1
            ? 'That contact is not one of your leads.'
            : 'None of those contacts are yours to call.',
      },
      { status: 404 }
    );
  }
  if (queueable.length === 0) {
    // Saying which wall was hit matters: "do not call" is a decision to
    // respect, "already on a call" just means wait a moment.
    const parts: string[] = [];
    if (blocked.length) parts.push(`${blocked.length} marked do-not-call`);
    if (inProgress.length) parts.push(`${inProgress.length} already on a call`);
    return NextResponse.json(
      { error: `Nothing to dial — ${parts.join(' and ')}.` },
      { status: 409 }
    );
  }

  // -------------------------------------------------------------------------
  // Build the campaign, attach the contacts, start it.
  // -------------------------------------------------------------------------
  const rawName = typeof body.name === 'string' ? body.name.trim() : '';
  const name = (rawName || defaultName(queueable.length)).slice(0, 120);
  const hoursJson = businessHoursJson(body.businessHours);

  const companyId = requireCompany(user);
  const campaign = await db.campaign.create({
    data: {
      name,
      agentId: agent.id,
      createdById: user.id,
      companyId,
      status: CampaignStatus.draft,
      concurrency: toInt(body.concurrency, 3, 1, 50),
      retryLimit: 1,
      retryDelayMins: 60,
      businessHours: hoursJson ?? Prisma.DbNull,
    },
  });

  // The scope and the status guard are re-applied on the write, not just the
  // read: a lead can be reassigned or marked do-not-call between the two, and
  // that must lose the race rather than be dialled anyway.
  //
  // Attempt counters are reset because the user is explicitly asking for these
  // people to be called now — an "exhausted" lead would otherwise be attached
  // and never dialled.
  const attached = await db.contact.updateMany({
    where: {
      AND: [
        { id: { in: queueable.map((c) => c.id) } },
        visibleContacts(user),
        { status: { notIn: UNQUEUEABLE } },
      ],
    },
    data: {
      campaignId: campaign.id,
      status: ContactStatus.pending,
      attempts: 0,
      nextAttemptAt: null,
    },
  });

  if (attached.count === 0) {
    // Nothing landed, so there is no campaign worth keeping around.
    await db.campaign.delete({ where: { id: campaign.id } });
    return NextResponse.json(
      { error: 'Those contacts became unavailable before the run could start. Refresh and try again.' },
      { status: 409 }
    );
  }

  await db.campaign.update({
    where: { id: campaign.id },
    data: { status: CampaignStatus.running, startedAt: new Date(), completedAt: null },
  });

  const movedFromOtherCampaigns = queueable.filter(
    (c) => c.campaignId !== null && c.campaignId !== campaign.id
  ).length;

  // Written before the first tick so the record survives a dial that throws.
  await db.auditLog.create({
    data: {
      action: 'campaign.bulk_started',
      entity: 'Campaign',
      entityId: campaign.id,
      userId: user.id,
      meta: {
        requested: requestedIds.length,
        queued: attached.count,
        skippedDoNotCall: blocked.length,
        skippedInProgress: inProgress.length,
        notEligible,
        movedFromOtherCampaigns,
        agentId: agent.id,
        concurrency: campaign.concurrency,
      },
    },
  });

  // Dial immediately so the user sees movement instead of waiting for the
  // scheduler's next tick.
  let result: TickResult | null = null;
  let tickError: string | null = null;
  try {
    result = await tickCampaign(campaign.id);
  } catch (e) {
    tickError = e instanceof Error && e.message ? e.message : 'The first dial attempt failed.';
    console.error(`[campaign ${campaign.id}] first bulk tick threw:`, tickError);
  }

  const hours = parseBusinessHours(campaign.businessHours);
  const outside = !isWithinBusinessHours(hours);

  // The runner's own `skipped` strings are internal shorthand, so they are
  // wrapped rather than shown raw — the user needs to know the queue is intact.
  const notice = tickError
    ? `Queued, but the first dial attempt failed (${tickError}). The campaign is running and will retry.`
    : outside
      ? `Queued, but it is outside calling hours (${describeWindow(hours)}). Dialling starts automatically when the window opens.`
      : result?.skipped
        ? `Queued, but nothing was dialled yet (${result.skipped}). The runner picks them up on its next pass.`
        : null;

  return NextResponse.json(
    {
      ok: true,
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: result?.status ?? CampaignStatus.running,
      requested: requestedIds.length,
      queued: attached.count,
      skippedDoNotCall: blocked.length,
      skippedInProgress: inProgress.length,
      notEligible,
      movedFromOtherCampaigns,
      dialled: result?.dialled ?? 0,
      failed: result?.failed ?? 0,
      remaining: result?.remaining ?? attached.count,
      mock: isMockMode(),
      notice,
    },
    { status: 201 }
  );
}
