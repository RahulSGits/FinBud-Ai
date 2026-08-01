import type { CallRow } from '@/components/calls/call-list';

/** The number the customer sees, when the engine reports one. */
function fromNumber(c: any): string | null {
  return c.fromNumber ?? null;
}

export function toCallRow(c: any): CallRow {
  return {
    id: c.id,
    phone: c.phone,
    fromNumber: fromNumber(c),
    contactName: c.contact?.name ?? null,
    agentName: c.agent?.name ?? null,
    campaignName: c.campaign?.name ?? null,
    status: c.status,
    leadStatus: c.leadStatus,
    durationSec: c.durationSec,
    summary: c.summary ?? null,
    transcriptText: c.transcriptText ?? null,
    // Why a call never left the building. Only ever set on a failed dial, and
    // the only place the cause is visible after the toast has gone.
    failureReason: c.failureReason ?? null,
    startedAt: (c.startedAt instanceof Date ? c.startedAt : new Date(c.startedAt)).toISOString(),
  };
}
