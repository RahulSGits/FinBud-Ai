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
    // startedAt orders this call against any newer one to the same contact.
    select: { id: true, contactId: true, campaignId: true, status: true, startedAt: true },
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
      // A result arrived, so whatever we assumed while waiting for it is no
      // longer true. Without this a call reaped as stale keeps "No result
      // received — the call was abandoned as stale", and the call list swaps
      // the outcome badge for a red "not dispatched" chip whenever
      // failureReason is set — so a completed, interested call reads as a
      // failure for as long as anyone looks at it.
      failureReason: null,
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
    // Whether anyone actually spoke decides what an unlabelled outcome means.
    const connected = (report.durationSec ?? 0) > 0 || !!report.transcriptText;
    await advanceContact(call.contactId, call.campaignId, leadStatus, connected, {
      id: call.id,
      startedAt: call.startedAt,
    });
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
  leadStatus: LeadStatus,
  /** True when the call actually connected — someone spoke, or time elapsed. */
  connected: boolean,
  /** The call this report is for, so a late one cannot overrule a newer call. */
  reportingCall: { id: string; startedAt: Date }
): Promise<void> {
  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return;

  // A report can arrive after the contact has already been dialled again —
  // a webhook retried, or a reconcile pass catching up on a call that was
  // reaped and released. Every other conditional write in this subsystem is
  // guarded; this one was the outlier, and the damaging direction is a stale
  // report setting the contact back to `retry` while a call to them is live,
  // which the next tick turns into a second simultaneous call to a real person.
  const newerInFlight = await db.call.findFirst({
    where: {
      contactId,
      id: { not: reportingCall.id },
      startedAt: { gt: reportingCall.startedAt },
      status: { in: [CallStatus.initiated, CallStatus.ringing, CallStatus.in_progress] },
    },
    select: { id: true },
  });
  if (newerInFlight) {
    console.warn(
      `[report] ignoring outcome for call ${reportingCall.id}: contact ${contactId} has a newer call in flight.`
    );
    return;
  }

  if (leadStatus === LeadStatus.not_interested) {
    // `completed`, not `do_not_call`. Declining an overdraft today is a closed
    // opportunity; do_not_call is a consent state that means "this person asked
    // us to stop contacting them". Conflating them was costly in both
    // directions: it is irreversible from the UI, and it also gates WhatsApp
    // (lib/messaging/send.ts), so one soft "not right now" permanently severed
    // every future channel to that customer. An explicit opt-out still reaches
    // do_not_call — it just has to actually be an opt-out.
    await db.contact.update({
      where: { id: contactId },
      data: { status: ContactStatus.completed, nextAttemptAt: null },
    });
    return;
  }

  // `unknown` means the engine told us nothing about the outcome, which is most
  // often just the provider declining to label the call rather than anything
  // about the lead. Treating it as terminal retired contacts that had never
  // actually been spoken to.
  //
  // But it only becomes a retry when nobody answered. If the call connected,
  // the conversation happened and is sitting in the transcript for a human to
  // read; redialling someone who has just spoken to us would be worse than
  // leaving the row closed.
  const retryable =
    leadStatus === LeadStatus.no_answer ||
    leadStatus === LeadStatus.voicemail ||
    (leadStatus === LeadStatus.unknown && !connected);

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
