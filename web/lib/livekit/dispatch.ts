// LiveKit call dispatch.
//
// Placing an outbound call is two steps:
//   1. Create an agent dispatch for a room, carrying the metadata the worker
//      needs (which agent config to load, which Call row to report against).
//   2. Create a SIP participant, which dials the customer into that room.
//
// The worker joins the room, runs the voice pipeline, and posts results back to
// /api/internal/call-report.
import { AgentDispatchClient, SipClient } from 'livekit-server-sdk';
import { CallStatus } from '@prisma/client';

const AGENT_NAME = process.env.LIVEKIT_AGENT_NAME || 'finbud-agent';

export interface DispatchParams {
  /** E.164 destination. */
  to: string;
  /** Our Call row id — round-tripped so the worker can report against it. */
  callId: string;
  agentId: string;
  contactId?: string | null;
  campaignId?: string | null;
  customerName?: string | null;
}

export interface DispatchResult {
  roomName: string;
  status: CallStatus;
}

export class LiveKitNotConfiguredError extends Error {
  constructor(readonly missing: string[]) {
    super(`LiveKit is not configured. Missing: ${missing.join(', ')}`);
    this.name = 'LiveKitNotConfiguredError';
  }
}

export class DispatchError extends Error {
  constructor(message: string, readonly detail?: string) {
    super(message);
    this.name = 'DispatchError';
  }
}

function config() {
  const url = process.env.LIVEKIT_URL || '';
  const key = process.env.LIVEKIT_API_KEY || '';
  const secret = process.env.LIVEKIT_API_SECRET || '';
  const trunkId = process.env.LIVEKIT_SIP_TRUNK_ID || '';

  const missing: string[] = [];
  if (!url) missing.push('LIVEKIT_URL');
  if (!key) missing.push('LIVEKIT_API_KEY');
  if (!secret) missing.push('LIVEKIT_API_SECRET');

  return { url, key, secret, trunkId, missing };
}

/** True when outbound dialling can actually work. */
export function isDispatchConfigured(): { ok: boolean; missing: string[] } {
  const c = config();
  const missing = [...c.missing];
  if (!c.trunkId) missing.push('LIVEKIT_SIP_TRUNK_ID');
  return { ok: missing.length === 0, missing };
}

/** True in mock mode: simulate calls locally with no telephony spend. */
export function isMockMode(): boolean {
  return process.env.USE_MOCK_CALLS === 'true';
}

function normalisePhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('+')) return trimmed;
  const digits = trimmed.replace(/\D/g, '');
  // Bare 10-digit numbers are assumed Indian — this deployment is India-first.
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Dial a customer and attach an AI agent to the call.
 *
 * The room name doubles as our correlation id, so webhook and worker events can
 * always be traced back to the Call row without a separate lookup table.
 */
export async function dispatchCall(params: DispatchParams): Promise<DispatchResult> {
  const c = config();
  if (c.missing.length) throw new LiveKitNotConfiguredError(c.missing);
  if (!c.trunkId) throw new LiveKitNotConfiguredError(['LIVEKIT_SIP_TRUNK_ID']);

  const roomName = `call-${params.callId}`;
  const to = normalisePhone(params.to);

  // Everything the stateless worker needs to run this specific call.
  const metadata = JSON.stringify({
    callLogId: params.callId,
    agentId: params.agentId,
    contactId: params.contactId ?? null,
    campaignId: params.campaignId ?? null,
    customerName: params.customerName ?? null,
    customerPhone: to,
  });

  const dispatchClient = new AgentDispatchClient(c.url, c.key, c.secret);
  const sipClient = new SipClient(c.url, c.key, c.secret);

  // Dispatch the agent first. If we dialled first and the agent failed to
  // attach, the customer would answer to silence.
  try {
    await dispatchClient.createDispatch(roomName, AGENT_NAME, { metadata });
  } catch (err: any) {
    throw new DispatchError('Could not dispatch the AI agent', err?.message);
  }

  try {
    await sipClient.createSipParticipant(c.trunkId, to, roomName, {
      participantIdentity: `caller-${params.callId}`,
      participantName: params.customerName || to,
      // Return as soon as the INVITE is accepted; the worker reports progress.
      waitUntilAnswered: false,
    });
  } catch (err: any) {
    throw new DispatchError('Could not place the call', err?.message);
  }

  return { roomName, status: CallStatus.ringing };
}

/** Hang up an in-flight call by deleting its room. */
export async function endCall(roomName: string): Promise<void> {
  const c = config();
  if (c.missing.length) return;

  const { RoomServiceClient } = await import('livekit-server-sdk');
  const rooms = new RoomServiceClient(c.url, c.key, c.secret);
  await rooms.deleteRoom(roomName).catch(() => {});
}
