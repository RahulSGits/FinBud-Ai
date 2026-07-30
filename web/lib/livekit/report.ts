// Single place a finished call is persisted.
//
// Both the LiveKit worker (via /api/internal/call-report) and the mock
// simulator funnel through here, so results can never drift between them.
import { CallStatus, ContactStatus, LeadStatus } from '@prisma/client';
import { db } from '../db';

export interface CallReport {
  callId: string;
  durationSec: number;
  transcript?: { role: string; text: string }[] | null;
  transcriptText?: string | null;
  summary?: string | null;
  interested: boolean;
  leadStatus: LeadStatus | string;
  leadScore?: number | null;
  customerIntent?: string | null;
  nextAction?: string | null;
  objections?: string | null;
  recordingUrl?: string | null;
}

function toLeadStatus(raw: unknown): LeadStatus {
  const s = String(raw ?? '').toLowerCase().replace(/[\s-]/g, '_');
  return (Object.values(LeadStatus) as string[]).includes(s)
    ? (s as LeadStatus)
    : LeadStatus.unknown;
}

/**
 * Persist a completed call, advance its contact, and close the campaign if the
 * queue has drained.
 */
export async function applyCallReport(report: CallReport): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: report.callId },
    select: { id: true, contactId: true, campaignId: true, status: true },
  });

  // A report for a deleted call must not throw — the worker would retry forever.
  if (!call) {
    console.warn(`[report] no call ${report.callId}; ignoring`);
    return;
  }

  const leadStatus = toLeadStatus(report.leadStatus);

  await db.call.update({
    where: { id: call.id },
    data: {
      status: CallStatus.completed,
      endedAt: new Date(),
      durationSec: Math.max(0, Math.round(report.durationSec || 0)),
      transcript: report.transcript ?? undefined,
      transcriptText: report.transcriptText ?? null,
      summary: report.summary ?? null,
      interested: !!report.interested,
      leadStatus,
      leadScore: report.leadScore ?? null,
      customerIntent: report.customerIntent ?? null,
      nextAction: report.nextAction ?? null,
      objections: report.objections ?? null,
      recordingUrl: report.recordingUrl ?? null,
    },
  });

  if (call.contactId) {
    await advanceContact(call.contactId, call.campaignId, leadStatus);
  }

  if (call.campaignId) {
    await maybeCompleteCampaign(call.campaignId);
  }
}

/**
 * Decide what happens to the contact next: retry, stop, or done.
 * Nobody-answered outcomes are retryable because the lead is untouched.
 */
async function advanceContact(
  contactId: string,
  campaignId: string | null,
  leadStatus: LeadStatus
): Promise<void> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;

  if (leadStatus === LeadStatus.not_interested) {
    await db.contact.update({
      where: { id: contactId },
      data: { status: ContactStatus.do_not_call, nextAttemptAt: null },
    });
    return;
  }

  const retryable = leadStatus === LeadStatus.no_answer || leadStatus === LeadStatus.voicemail;

  if (!retryable) {
    await db.contact.update({
      where: { id: contactId },
      data: { status: ContactStatus.completed, nextAttemptAt: null },
    });
    return;
  }

  const campaign = campaignId
    ? await db.campaign.findUnique({
        where: { id: campaignId },
        select: { retryLimit: true, retryDelayMins: true },
      })
    : null;

  const retryLimit = campaign?.retryLimit ?? 0;
  const delayMins = campaign?.retryDelayMins ?? 60;

  if (contact.attempts > retryLimit) {
    await db.contact.update({
      where: { id: contactId },
      data: { status: ContactStatus.exhausted, nextAttemptAt: null },
    });
    return;
  }

  await db.contact.update({
    where: { id: contactId },
    data: {
      status: ContactStatus.retry,
      nextAttemptAt: new Date(Date.now() + Math.max(1, delayMins) * 60_000),
    },
  });
}

/** Close a campaign once nothing is queued and nothing is still ringing. */
async function maybeCompleteCampaign(campaignId: string): Promise<void> {
  const [queued, inFlight] = await Promise.all([
    db.contact.count({
      where: {
        campaignId,
        status: { in: [ContactStatus.pending, ContactStatus.retry, ContactStatus.calling] },
      },
    }),
    db.call.count({
      where: {
        campaignId,
        status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress] },
      },
    }),
  ]);

  if (queued === 0 && inFlight === 0) {
    await db.campaign.updateMany({
      where: { id: campaignId, status: 'running' },
      data: { status: 'completed', completedAt: new Date() },
    });
  }
}
