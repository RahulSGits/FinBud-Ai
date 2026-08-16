// Bulk calling engine.
//
// Tick-based rather than a long-lived loop: each tick dials whatever the
// campaign is currently allowed to dial, then returns. That behaves identically
// on an always-on host and on serverless, and makes the whole thing
// restart-safe — all state lives in the database, never in memory.
//
// Driven by:
//   POST /api/campaigns/[id]/control   (immediate first tick on start/resume)
//   POST /api/campaigns/tick           (scheduler, every running campaign)
import { CallStatus, CampaignStatus, ContactStatus } from '@prisma/client';
import { db } from '../db';
import { agentToConfig, getProvider, isMockMode } from '../providers';
import { noteDispatchOutcome } from '../providers/usage';
import { isWithinBusinessHours, parseBusinessHours } from './business-hours';

const IN_FLIGHT: CallStatus[] = [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress];
const DIALABLE: ContactStatus[] = [ContactStatus.pending, ContactStatus.retry];

/**
 * How long a call may stay in flight before we assume it is lost.
 *
 * A crashed worker or a dropped webhook leaves a call "ringing" forever, and
 * because in-flight calls consume concurrency slots that permanently stalls the
 * campaign.
 *
 * Twelve minutes, set by the engine rather than by preference: OmniDimension
 * enforces a ten-minute ceiling of its own and ignores any duration we send, so
 * reaping sooner would mark genuinely live conversations as abandoned and
 * release their contact to be dialled a second time. Twelve leaves room for the
 * result to arrive after the engine hangs up.
 *
 * This only frees the concurrency slot; it cannot end a live call, because
 * OmniDimension exposes no hangup endpoint. The agent's own end-call condition
 * is what actually stops the meter.
 */
const STALE_CALL_MS = 12 * 60_000;

/**
 * Fail calls that have been in flight too long and release their contacts.
 * Runs at the start of every tick so a campaign can always recover itself.
 */
async function reapStaleCalls(campaign: {
  id: string;
  retryLimit: number;
  retryDelayMins: number;
}): Promise<number> {
  const campaignId = campaign.id;
  const cutoff = new Date(Date.now() - STALE_CALL_MS);

  const stale = await db.call.findMany({
    where: { campaignId, status: { in: IN_FLIGHT }, startedAt: { lt: cutoff } },
    select: { id: true, contactId: true },
  });
  if (stale.length === 0) return 0;

  await db.call.updateMany({
    where: { id: { in: stale.map((c) => c.id) } },
    data: {
      status: CallStatus.failed,
      endedAt: new Date(),
      failureReason: 'No result received — the call was abandoned as stale.',
    },
  });

  // Release the contacts, honouring the same retry policy as a failed dial.
  //
  // This used to send every reaped contact straight back to `retry` with
  // nextAttemptAt = now, consulting neither retryLimit nor retryDelayMins. With
  // a scheduler ticking every few minutes that is an unbounded redial loop: the
  // same real person is called again roughly every STALE_CALL_MS, for as long
  // as the campaign runs, and no setting anywhere stops it. It is the one path
  // in this file that can spend money without a human doing anything, so it now
  // uses exactly the ceiling the dial-failure path at the bottom of this file
  // already applies.
  const contactIds = stale.map((c) => c.contactId).filter((id): id is string => !!id);
  if (contactIds.length) {
    const delayMs = Math.max(1, campaign.retryDelayMins) * 60_000;

    // Out of attempts: stop, rather than retrying forever.
    await db.contact.updateMany({
      where: {
        id: { in: contactIds },
        status: ContactStatus.calling,
        attempts: { gte: campaign.retryLimit },
      },
      data: { status: ContactStatus.exhausted, nextAttemptAt: null },
    });

    // Still has attempts left: wait the configured delay, not zero. Retrying
    // immediately would also mean redialling someone whose call may only just
    // have ended.
    await db.contact.updateMany({
      where: {
        id: { in: contactIds },
        status: ContactStatus.calling,
        attempts: { lt: campaign.retryLimit },
      },
      data: { status: ContactStatus.retry, nextAttemptAt: new Date(Date.now() + delayMs) },
    });
  }

  console.warn(`[campaign ${campaignId}] reaped ${stale.length} stale call(s)`);
  return stale.length;
}

export interface TickResult {
  campaignId: string;
  status: string;
  dialled: number;
  failed: number;
  skipped: string | null;
  remaining: number;
}

/**
 * Run one tick for a campaign.
 *
 * Safe to call concurrently: contacts are claimed with a conditional update, so
 * overlapping ticks can never dial the same person twice.
 */
export async function tickCampaign(campaignId: string): Promise<TickResult> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { agent: true },
  });

  if (!campaign) {
    return { campaignId, status: 'missing', dialled: 0, failed: 0, skipped: 'campaign not found', remaining: 0 };
  }

  const base = { campaignId, status: campaign.status as string, dialled: 0, failed: 0, remaining: 0 };
  const touch = () => db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });

  if (campaign.status !== CampaignStatus.running) {
    return { ...base, skipped: `campaign is ${campaign.status}` };
  }

  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    return { ...base, skipped: 'scheduled for later' };
  }

  // Recover abandoned calls before measuring capacity, otherwise a stuck call
  // holds a concurrency slot forever and the campaign never finishes.
  await reapStaleCalls(campaign);

  const hours = parseBusinessHours(campaign.businessHours);
  if (!isWithinBusinessHours(hours)) {
    await touch();
    return { ...base, skipped: 'outside calling hours' };
  }

  // Daily cap, counted from calls actually placed today so a restart cannot
  // silently reset the budget.
  let budget = Number.POSITIVE_INFINITY;
  if (campaign.dailyCallLimit && campaign.dailyCallLimit > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const usedToday = await db.call.count({
      where: { campaignId, startedAt: { gte: startOfDay } },
    });
    budget = campaign.dailyCallLimit - usedToday;
    if (budget <= 0) {
      await touch();
      return { ...base, skipped: 'daily call limit reached' };
    }
  }

  const inFlight = await db.call.count({ where: { campaignId, status: { in: IN_FLIGHT } } });
  const slots = Math.min(Math.max(1, campaign.concurrency) - inFlight, budget);

  if (slots <= 0) {
    await touch();
    return { ...base, skipped: 'at concurrency limit' };
  }

  const now = new Date();
  const candidates = await db.contact.findMany({
    where: {
      campaignId,
      status: { in: DIALABLE },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      // A hard ceiling on attempts, independent of how a contact came to be
      // dialable. Every path that sets `retry` is supposed to check the limit
      // first, but this is the query that actually spends money, so it does not
      // rely on all of them having remembered — one that forgets costs real
      // calls to a real person.
      attempts: { lt: Math.max(1, campaign.retryLimit + 1) },
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: slots,
  });

  if (candidates.length === 0) {
    const remaining = await countRemaining(campaignId);
    if (remaining === 0 && inFlight === 0) {
      await db.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.completed, completedAt: new Date(), lastTickAt: new Date() },
      });
      return { campaignId, status: 'completed', dialled: 0, failed: 0, skipped: null, remaining: 0 };
    }
    await touch();
    return { ...base, skipped: 'nothing due yet', remaining };
  }

  let dialled = 0;
  let failed = 0;

  for (const contact of candidates) {
    // Claim it. If another tick got there first, updateMany matches nothing.
    const claim = await db.contact.updateMany({
      where: { id: contact.id, status: { in: DIALABLE } },
      data: {
        status: ContactStatus.calling,
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claim.count === 0) continue;

    // From here the contact is held at `calling`, and only a Call row makes
    // that recoverable — both the reaper and the reconciler search by call, not
    // by contact. If this insert fails (a pool timeout is the realistic case)
    // the contact is stranded with nothing to find it, and only a manual edit
    // brings it back. So a failure here releases the claim rather than leaving
    // it held.
    let call;
    try {
      call = await db.call.create({
        data: {
          phone: contact.phone,
          direction: 'outbound',
          status: CallStatus.initiated,
          contactId: contact.id,
          campaignId,
          agentId: campaign.agentId,
          companyId: campaign.companyId,
        },
      });
    } catch (err) {
      console.error(`[campaign ${campaignId}] could not record a call for ${contact.id}:`, err);
      await db.contact.updateMany({
        where: { id: contact.id, status: ContactStatus.calling },
        data: { status: ContactStatus.retry, nextAttemptAt: new Date(Date.now() + 60_000) },
      }).catch(() => undefined);
      failed++;
      continue;
    }

    try {
      // Resolve the engine from the agent, and dial ONLY through the provider
      // interface — the runner never knows which vendor executes the call.
      const provider = getProvider(campaign.agent.voiceProvider);
      const result = await provider.startCall({
        to: contact.phone,
        externalAgentId: campaign.agent.externalAgentId,
        config: agentToConfig(campaign.agent),
        metadata: {
          callLogId: call.id,
          agentId: campaign.agentId,
          contactId: contact.id,
          campaignId,
          customerName: contact.name,
        },
      });

      await db.call.update({
        where: { id: call.id },
        data: { providerCallId: result.providerCallId, status: result.status },
      });
      dialled++;
    } catch (err: any) {
      // Keep the provider's own detail — a generic message hides the fix.
      const reason = [err?.message, err?.detail].filter(Boolean).join(' — ').slice(0, 400);
      console.error(`[campaign ${campaignId}] dial failed for ${contact.phone}: ${reason}`);
      // A campaign is where credit actually runs out — it dials in bulk and
      // unattended — so the out-of-credit signal has to be captured here too,
      // not only on the manual path somebody is watching.
      void noteDispatchOutcome(reason);

      await db.call.update({
        where: { id: call.id },
        data: { status: CallStatus.failed, endedAt: new Date(), failureReason: reason },
      });

      // A dial that never connected shouldn't burn a retry attempt.
      await db.contact.update({
        where: { id: contact.id },
        data: {
          status: contact.attempts >= campaign.retryLimit ? ContactStatus.exhausted : ContactStatus.retry,
          nextAttemptAt: new Date(Date.now() + Math.max(1, campaign.retryDelayMins) * 60_000),
        },
      });
      failed++;
    }
  }

  await touch();

  return {
    campaignId,
    status: 'running',
    dialled,
    failed,
    skipped: null,
    remaining: await countRemaining(campaignId),
  };
}

/** Tick every running campaign. Used by the scheduler endpoint. */
export async function tickAllCampaigns(): Promise<TickResult[]> {
  const running = await db.campaign.findMany({
    where: { status: CampaignStatus.running },
    select: { id: true },
  });

  const results: TickResult[] = [];
  for (const c of running) {
    try {
      results.push(await tickCampaign(c.id));
    } catch (err: any) {
      console.error(`[campaign ${c.id}] tick threw:`, err?.message);
      results.push({
        campaignId: c.id, status: 'error', dialled: 0, failed: 0,
        skipped: err?.message || 'tick failed', remaining: 0,
      });
    }
  }
  return results;
}

async function countRemaining(campaignId: string): Promise<number> {
  return db.contact.count({
    where: {
      campaignId,
      status: { in: [...DIALABLE, ContactStatus.calling] },
    },
  });
}
