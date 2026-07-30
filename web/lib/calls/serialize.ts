import type { CallRow } from '@/components/calls/call-list';

export function toCallRow(c: any): CallRow {
  return {
    id: c.id,
    phone: c.phone,
    contactName: c.contact?.name ?? null,
    agentName: c.agent?.name ?? null,
    campaignName: c.campaign?.name ?? null,
    status: c.status,
    leadStatus: c.leadStatus,
    durationSec: c.durationSec,
    summary: c.summary ?? null,
    transcriptText: c.transcriptText ?? null,
    startedAt: (c.startedAt instanceof Date ? c.startedAt : new Date(c.startedAt)).toISOString(),
  };
}
