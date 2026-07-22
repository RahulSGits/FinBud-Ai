// Campaign execution engine.
//
// Tick-based rather than a long-lived loop: every tick dials whatever the
// campaign is currently allowed to dial, then returns. That works identically
// on an always-on host and on serverless (where no process survives a request),
// and it makes the whole thing restart-safe — state lives in the database, not
// in memory.
//
// A tick is driven by:
//   - POST /api/campaigns/[id]/start   (immediate first tick)
//   - POST /api/campaigns/tick         (scheduler / cron, all running campaigns)
import { db } from '../db';
import { IN_FLIGHT_STATUSES, agentToConfig, getVoiceProvider, isMockMode } from '../providers/voice';
import { isWithinBusinessHours, parseBusinessHours } from './business-hours';

export interface TickResult {
  campaignId: string;
  status: string;
  dialled: number;
  skipped: string | null;
  remaining: number;
}

/** Contacts that still owe us a call attempt. */
const DIALABLE = ['pending', 'retry'];

/**
 * Run one tick for a single campaign.
 *
 * Safe to call concurrently: contacts are claimed with a conditional update, so
 * two overlapping ticks can never dial the same contact twice.
 */
export async function tickCampaign(campaignId: string): Promise<TickResult> {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { agent: { include: { prompts: { where: { isActive: true }, take: 1 } } } },
  });

  if (!campaign) {
    return { campaignId, status: 'missing', dialled: 0, skipped: 'campaign not found', remaining: 0 };
  }

  const base = { campaignId, status: campaign.status, dialled: 0, remaining: 0 };

  if (campaign.status !== 'running') {
    return { ...base, skipped: `status is ${campaign.status}` };
  }

  // Scheduled campaigns wait for their start time.
  if (campaign.scheduledAt && campaign.scheduledAt > new Date()) {
    return { ...base, skipped: 'scheduled for later' };
  }

  const hours = parseBusinessHours(campaign.businessHours);
  if (!isWithinBusinessHours(hours)) {
    await db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });
    return { ...base, skipped: 'outside business hours' };
  }

  // Daily cap — counted from calls actually placed today, so a restart cannot
  // reset the budget.
  let dailyBudget = Number.POSITIVE_INFINITY;
  if (campaign.callLimits && campaign.callLimits > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const today = await db.callLog.count({
      where: { campaignId, startedAt: { gte: startOfDay } },
    });

    dailyBudget = campaign.callLimits - today;
    if (dailyBudget <= 0) {
      await db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });
      return { ...base, skipped: 'daily call limit reached' };
    }
  }

  // Concurrency — how many of this campaign's calls are still live.
  const inFlight = await db.callLog.count({
    where: { campaignId, status: { in: IN_FLIGHT_STATUSES } },
  });

  const concurrency = Math.max(1, campaign.concurrency);
  const slots = Math.min(concurrency - inFlight, dailyBudget);

  if (slots <= 0) {
    await db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });
    return { ...base, skipped: 'concurrency limit reached' };
  }

  const now = new Date();
  const candidates = await db.contact.findMany({
    where: {
      campaignId,
      status: { in: DIALABLE },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ nextAttemptAt: 'asc' }, { createdAt: 'asc' }],
    take: slots,
  });

  if (candidates.length === 0) {
    const remaining = await countRemaining(campaignId);
    if (remaining === 0 && inFlight === 0) {
      await db.campaign.update({
        where: { id: campaignId },
        data: { status: 'completed', completedAt: new Date(), lastTickAt: new Date() },
      });
      return { campaignId, status: 'completed', dialled: 0, skipped: null, remaining: 0 };
    }
    await db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });
    return { ...base, skipped: 'nothing due yet', remaining };
  }

  const provider = getVoiceProvider(campaign.agent.provider);
  const config = agentToConfig(campaign.agent);
  const externalAgentId = campaign.agent.externalAgentId || campaign.agent.vapiAssistantId;

  const fromNumber = await db.phoneNumber.findFirst({
    where: { organizationId: campaign.organizationId, status: 'active' },
  });

  let dialled = 0;

  for (const contact of candidates) {
    // Claim the contact. If another tick already moved it, updateMany matches
    // zero rows and we skip — this is the concurrency guard.
    const claim = await db.contact.updateMany({
      where: { id: contact.id, status: { in: DIALABLE } },
      data: { status: 'calling', lastAttemptAt: new Date(), attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;

    const callLog = await db.callLog.create({
      data: {
        organizationId: campaign.organizationId,
        agentId: campaign.agentId,
        campaignId,
        contactId: contact.id,
        phone: contact.phone,
        direction: 'outbound',
        status: 'initiated',
      },
    });

    try {
      const result = await provider.startCall({
        to: contact.phone,
        externalAgentId,
        fromNumberId: fromNumber?.sid || null,
        config,
        metadata: { callLogId: callLog.id, campaignId, contactId: contact.id },
      });

      await db.callLog.update({
        where: { id: callLog.id },
        data: { providerCallId: result.providerCallId, status: result.status },
      });
      dialled++;
    } catch (err: any) {
      // Keep the provider's own detail — "assistantId must be a UUID" is
      // actionable, "Vapi request failed (400)" alone is not.
      const detail = err?.detail ? ` — ${String(err.detail)}` : '';
      const reason = `${err?.message || 'Dial failed'}${detail}`.slice(0, 400);
      console.error(`[campaign ${campaignId}] dial failed for ${contact.phone}: ${reason}`);

      await db.callLog.update({
        where: { id: callLog.id },
        data: { status: 'failed', outcome: reason },
      });

      await scheduleRetry(contact.id, contact.attempts + 1, campaign.retryLimit, campaign.retryDelayMins);
      await db.campaign.update({
        where: { id: campaignId },
        data: { failedCalls: { increment: 1 } },
      });
    }
  }

  await db.campaign.update({ where: { id: campaignId }, data: { lastTickAt: new Date() } });

  return {
    campaignId,
    status: 'running',
    dialled,
    skipped: null,
    remaining: await countRemaining(campaignId),
  };
}

/** Tick every running campaign. Used by the scheduler endpoint. */
export async function tickAllCampaigns(): Promise<TickResult[]> {
  const running = await db.campaign.findMany({
    where: { status: 'running' },
    select: { id: true },
  });

  const results: TickResult[] = [];
  for (const c of running) {
    try {
      results.push(await tickCampaign(c.id));
    } catch (err: any) {
      console.error(`[campaign ${c.id}] tick failed:`, err?.message);
      results.push({
        campaignId: c.id,
        status: 'error',
        dialled: 0,
        skipped: err?.message || 'tick failed',
        remaining: 0,
      });
    }
  }
  return results;
}

/**
 * Called when a call finishes. Decides whether the contact is done or should be
 * retried, and closes the campaign once nothing is left.
 */
export async function onCampaignCallEnded(
  campaignId: string,
  contactId: string | null,
  interested: boolean,
  outcome: string | null
): Promise<void> {
  const campaign = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return;

  // Outcomes worth another attempt — nobody picked up, so the lead is untouched.
  const retryable = /no.?answer|voicemail|busy|failed|did-not-answer/i.test(outcome || '');

  if (contactId) {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (contact) {
      if (!interested && retryable) {
        await scheduleRetry(contactId, contact.attempts, campaign.retryLimit, campaign.retryDelayMins);
      } else {
        await db.contact.update({
          where: { id: contactId },
          data: { status: 'completed', nextAttemptAt: null },
        });
      }
    }
  }

  await db.campaign.update({
    where: { id: campaignId },
    data: { completedCalls: { increment: 1 } },
  });

  // Close the campaign when the queue is empty and nothing is still ringing.
  const remaining = await countRemaining(campaignId);
  const inFlight = await db.callLog.count({
    where: { campaignId, status: { in: IN_FLIGHT_STATUSES } },
  });

  if (remaining === 0 && inFlight === 0) {
    await db.campaign.updateMany({
      where: { id: campaignId, status: 'running' },
      data: { status: 'completed', completedAt: new Date() },
    });
  }
}

async function scheduleRetry(
  contactId: string,
  attempts: number,
  retryLimit: number,
  retryDelayMins: number
): Promise<void> {
  if (attempts > retryLimit) {
    await db.contact.update({
      where: { id: contactId },
      data: { status: 'exhausted', nextAttemptAt: null },
    });
    return;
  }

  await db.contact.update({
    where: { id: contactId },
    data: {
      status: 'retry',
      nextAttemptAt: new Date(Date.now() + Math.max(1, retryDelayMins) * 60_000),
    },
  });
}

async function countRemaining(campaignId: string): Promise<number> {
  return db.contact.count({
    where: { campaignId, status: { in: [...DIALABLE, 'calling'] } },
  });
}

/** Mock mode completes calls on its own, so ticks can be much tighter. */
export function tickIntervalMs(): number {
  return isMockMode() ? 3_000 : 15_000;
}
