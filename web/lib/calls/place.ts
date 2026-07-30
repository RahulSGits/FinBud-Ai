// Placing one call, on demand.
//
// The campaign runner dials in bulk; this is the single-contact path an
// employee uses from their lead list. Both end up in the same Call table and
// report through the same lib/livekit/report, so a manual call and a campaign
// call are indistinguishable downstream.
import { CallStatus, ContactStatus, Role } from '@prisma/client';
import { db } from '../db';
import { normalisePhone } from '../contacts/phone';
import { agentToConfig, getProvider, isMockMode } from '../providers';
import type { SessionUser } from '../auth';

/** Default calls-per-person-per-day when neither user nor Setting overrides it. */
const FALLBACK_DAILY_LIMIT = 100;

export class CallError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'CallError';
  }
}

async function defaultDailyLimit(): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: 'dailyCallLimit' } });
  const value = Number((row?.value as any) ?? NaN);
  return Number.isFinite(value) && value > 0 ? value : FALLBACK_DAILY_LIMIT;
}

/**
 * Dial one contact now.
 *
 * Throws CallError with a specific status so the route can turn each refusal
 * into a message the user can act on, rather than a generic 500.
 */
export async function placeCall(opts: {
  user: SessionUser;
  contactId: string;
  agentId?: string | null;
}): Promise<{ callId: string; status: CallStatus; mock: boolean }> {
  const contact = await db.contact.findUnique({ where: { id: opts.contactId } });
  if (!contact) throw new CallError('Contact not found', 404);

  // Employees may only dial their own leads. Admins may dial anyone.
  if (opts.user.role === Role.employee && contact.assignedToId !== opts.user.id) {
    throw new CallError('That lead is not assigned to you', 403);
  }

  if (contact.status === ContactStatus.do_not_call) {
    throw new CallError('This contact asked not to be called again', 409);
  }
  if (contact.status === ContactStatus.calling) {
    throw new CallError('A call to this contact is already in progress', 409);
  }

  // Guardrail: calls cost money, so cap how many one person can trigger a day.
  const me = await db.user.findUnique({
    where: { id: opts.user.id },
    select: { dailyCallLimit: true },
  });
  const limit = me?.dailyCallLimit ?? (await defaultDailyLimit());
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await db.call.count({
    where: { startedById: opts.user.id, startedAt: { gte: startOfDay } },
  });
  if (usedToday >= limit) {
    throw new CallError(`Daily call limit reached (${limit}). Ask an admin to raise it.`, 429);
  }

  // Explicit agent, else the contact's campaign agent, else the only active one.
  const agent = opts.agentId
    ? await db.agent.findUnique({ where: { id: opts.agentId } })
    : await resolveAgent(contact.campaignId);

  if (!agent) {
    throw new CallError('No active AI agent is available. Create and activate one first.', 409);
  }
  if (!agent.isActive) {
    throw new CallError(`Agent "${agent.name}" is not active.`, 409);
  }

  const provider = getProvider(agent.voiceProvider);
  if (!isMockMode() && !(await provider.isConfigured())) {
    throw new CallError(
      `${provider.name} is not configured. Add its credentials, or set USE_MOCK_CALLS=true to simulate.`,
      503
    );
  }

  // Claim the contact before creating the call, so two clicks cannot double-dial.
  const claim = await db.contact.updateMany({
    where: { id: contact.id, status: { not: ContactStatus.calling } },
    data: { status: ContactStatus.calling, lastAttemptAt: new Date(), attempts: { increment: 1 } },
  });
  if (claim.count === 0) {
    throw new CallError('A call to this contact is already in progress', 409);
  }

  const call = await db.call.create({
    data: {
      phone: contact.phone,
      direction: 'outbound',
      status: CallStatus.initiated,
      contactId: contact.id,
      campaignId: contact.campaignId,
      agentId: agent.id,
      startedById: opts.user.id,
    },
  });

  try {
    const result = await provider.startCall({
      to: contact.phone,
      externalAgentId: agent.externalAgentId,
      config: agentToConfig(agent),
      metadata: {
        callLogId: call.id,
        agentId: agent.id,
        contactId: contact.id,
        campaignId: contact.campaignId,
        customerName: contact.name,
      },
    });

    await db.call.update({
      where: { id: call.id },
      data: { providerCallId: result.providerCallId, status: result.status },
    });
    await db.auditLog.create({
      data: { action: 'call.started', entity: 'Call', entityId: call.id, userId: opts.user.id },
    });

    return { callId: call.id, status: result.status as CallStatus, mock: isMockMode() };
  } catch (err: any) {
    // Keep the provider's own detail — a generic message hides the fix.
    const reason = [err?.message, err?.detail].filter(Boolean).join(' — ').slice(0, 400);

    await db.call.update({
      where: { id: call.id },
      data: { status: CallStatus.failed, endedAt: new Date(), failureReason: reason },
    });
    // A dial that never connected shouldn't leave the contact stuck at "calling".
    await db.contact.update({
      where: { id: contact.id },
      data: { status: ContactStatus.retry, nextAttemptAt: new Date() },
    });

    throw new CallError(reason || 'Could not place the call', 502);
  }
}

/**
 * Turn a hand-typed number into the Contact row the call will hang off.
 *
 * Split out so placeManualCall can retry it once: Contact.phone is unique, and
 * two people dialling the same brand-new number at the same instant means one
 * of the two creates loses the race.
 */
async function resolveManualContact(
  user: SessionUser,
  phone: string,
  name: string | null
): Promise<{ contactId: string; created: boolean }> {
  const existing = await db.contact.findUnique({ where: { phone } });

  if (existing) {
    // Checked ahead of ownership on purpose. A do-not-call number must read as
    // "never dial this" whoever types it — telling a rep it merely belongs to a
    // colleague would send them off to get it reassigned, which is exactly the
    // route back to dialling someone who asked us to stop.
    if (existing.status === ContactStatus.do_not_call) {
      throw new CallError('This contact asked not to be called again', 409);
    }

    // Never take a lead over as a side effect of dialling: silently moving it
    // would rewrite another rep's pipeline and hide the call from their list.
    if (user.role === Role.employee && existing.assignedToId !== user.id) {
      throw new CallError(
        existing.assignedToId
          ? 'That lead is assigned to someone else. Ask an admin to reassign it before you call.'
          : 'That number is already in the CRM but is not assigned to you. Ask an admin to assign it first.',
        403
      );
    }

    // Fill a blank only. A name typed in a hurry must not overwrite what the
    // imported CRM record already holds.
    if (name && !existing.name) {
      await db.contact.update({ where: { id: existing.id }, data: { name } });
    }

    return { contactId: existing.id, created: false };
  }

  const fresh = await db.contact.create({
    data: {
      phone,
      name,
      // An employee's own manual dial has to land in their lead list — an
      // unassigned contact is invisible to the person who just created it, and
      // they would not be able to follow the call up.
      assignedToId: user.role === Role.employee ? user.id : null,
    },
  });

  return { contactId: fresh.id, created: true };
}

/**
 * Dial a number typed by hand.
 *
 * The AI agent still runs the conversation — this is only a manual trigger
 * rather than a campaign — so everything the shared path enforces (daily limit,
 * agent state, provider readiness, claim-before-dial, audit) has to apply here
 * too. It does, because this function resolves the number to a Contact and then
 * delegates to placeCall rather than reimplementing any of it.
 */
export async function placeManualCall(opts: {
  user: SessionUser;
  phone: string;
  name?: string | null;
  agentId?: string | null;
}): Promise<{
  callId: string;
  status: CallStatus;
  mock: boolean;
  contactId: string;
  contactCreated: boolean;
}> {
  const phone = normalisePhone(opts.phone);
  if (!phone) {
    throw new CallError(
      'That is not a number we can dial. Enter 10 digits for India, or + and the country code.',
      400
    );
  }

  const name = opts.name?.trim() || null;

  let resolved: { contactId: string; created: boolean };
  try {
    resolved = await resolveManualContact(opts.user, phone, name);
  } catch (e) {
    // A refusal is final; only a lost create race is worth a second attempt,
    // and by then the winner's row exists so the find branch takes over.
    if (e instanceof CallError) throw e;
    resolved = await resolveManualContact(opts.user, phone, name);
  }

  const result = await placeCall({
    user: opts.user,
    contactId: resolved.contactId,
    agentId: opts.agentId,
  });

  await db.auditLog.create({
    data: {
      action: 'call.manual',
      entity: 'Call',
      entityId: result.callId,
      userId: opts.user.id,
      meta: { phone, contactId: resolved.contactId, contactCreated: resolved.created },
    },
  });

  return { ...result, contactId: resolved.contactId, contactCreated: resolved.created };
}

/** The campaign's agent when the contact belongs to one, else the active agent. */
async function resolveAgent(campaignId: string | null) {
  if (campaignId) {
    const campaign = await db.campaign.findUnique({
      where: { id: campaignId },
      include: { agent: true },
    });
    if (campaign?.agent) return campaign.agent;
  }
  return db.agent.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: 'desc' },
  });
}

/** Hang up an in-flight call. */
export async function hangUp(user: SessionUser, callId: string): Promise<void> {
  const call = await db.call.findUnique({
    where: { id: callId },
    include: { agent: true, contact: { select: { id: true, assignedToId: true } } },
  });
  if (!call) throw new CallError('Call not found', 404);

  if (user.role === Role.employee && call.contact?.assignedToId !== user.id) {
    throw new CallError('That call is not yours to end', 403);
  }

  if (call.providerCallId) {
    const provider = getProvider(call.agent?.voiceProvider);
    await provider.endCall(call.providerCallId).catch(() => {});
  }

  await db.call.update({
    where: { id: call.id },
    data: {
      status: CallStatus.completed,
      endedAt: new Date(),
      failureReason: call.durationSec ? null : 'Ended by the operator before a result arrived.',
    },
  });

  if (call.contactId) {
    await db.contact.updateMany({
      where: { id: call.contactId, status: ContactStatus.calling },
      data: { status: ContactStatus.retry, nextAttemptAt: new Date() },
    });
  }
}
