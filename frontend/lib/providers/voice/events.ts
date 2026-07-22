// Single place where a normalised voice event is persisted.
// Both the provider webhooks and the mock simulator funnel through here, so
// call-log behaviour can never drift between real and mocked calls.
import { db } from '../../db';
import { VoiceWebhookEvent } from './types';

export async function applyVoiceEvent(event: VoiceWebhookEvent): Promise<void> {
  if (event.kind === 'ignored') return;

  // Ignore events for calls we don't know about rather than throwing — a
  // provider retrying a webhook for a deleted call must not 500 forever.
  const existing = await db.callLog.findUnique({ where: { id: event.callLogId } });
  if (!existing) return;

  if (event.kind === 'status') {
    await db.callLog.update({
      where: { id: event.callLogId },
      data: { status: event.status },
    });
    await db.callEvent.create({
      data: { callLogId: event.callLogId, type: 'status', payload: event.status },
    }).catch(() => {});
    return;
  }

  if (event.kind === 'transcript') {
    await db.callTranscript.upsert({
      where: { callLogId: event.callLogId },
      create: { callLogId: event.callLogId, transcript: event.transcript },
      update: { transcript: event.transcript },
    });
    return;
  }

  const r = event.report;
  await db.callLog.update({
    where: { id: event.callLogId },
    data: {
      status: 'completed',
      endedAt: new Date(),
      duration: r.durationSec,
      outcome: r.endedReason || 'Completed',
      recordingUrl: r.recordingUrl || null,
      transcript: r.transcriptJson || null,
      summary: r.summary || null,
      interested: r.interested,
      leadStatus: r.interested ? 'interested' : 'not_interested',
      customerIntent: r.customerIntent || null,
      nextAction: r.nextAction || null,
      objections: r.objections || null,
    },
  });

  // Advance the campaign queue: mark the contact done or schedule a retry, and
  // close the campaign when nothing is left. Awaited (unlike the notification
  // below) because campaign progress must not be lost if the process exits.
  if (existing.campaignId) {
    try {
      const { onCampaignCallEnded } = await import('../../campaigns/runner');
      await onCampaignCallEnded(
        existing.campaignId,
        existing.contactId,
        r.interested,
        r.endedReason ?? null
      );
    } catch (err) {
      console.error('Failed to advance campaign after call:', err);
    }
  }

  // Fire WhatsApp follow-up automation without blocking the webhook response.
  import('../../../services/whatsapp')
    .then(({ WhatsAppService }) =>
      WhatsAppService.evaluateConditionalTriggers(event.callLogId).catch(console.error)
    )
    .catch(console.error);
}
