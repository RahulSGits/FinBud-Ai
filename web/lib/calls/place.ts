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
import { noteDispatchOutcome } from '../providers/usage';
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

  // Notice a rotated API key BEFORE looking at the stored agent id.
  //
  // Provider-side ids belong to the account that issued them, so changing the
  // key turns every stored id into a 404. ensureAccountCurrent drops those ids
  // so the branch below republishes — but it used to run only inside syncAgent,
  // which this function calls only when there is NO id. An agent that still
  // held a stale one therefore dialled straight through and came back
  // "Agent not found or access denied", with the operator left to work out
  // that a key change was the cause. One Setting read closes that hole.
  let dialAgent = agent;
  if (!isMockMode() && provider.capabilities().serverAgents) {
    const { ensureAccountCurrent } = await import('../providers/account');
    // Only re-read when something was actually cleared; the common case is a
    // single Setting lookup and no extra query.
    const check = await ensureAccountCurrent(provider.id).catch(() => null);
    if (check?.rotated) {
      dialAgent = (await db.agent.findUnique({ where: { id: agent.id } })) ?? agent;
    }
  }

  // Engines with a server-side agent resource cannot dial one they have never
  // been told about. That is the normal state for every agent authored while
  // USE_MOCK_CALLS was true — sync is skipped in mock mode — so the first real
  // call after switching over would otherwise fail with "agent must be synced"
  // and stay broken until someone happened to re-save the agent. Sync on
  // demand instead, and report the sync failure rather than a dial failure,
  // because that is the thing that actually needs fixing.
  if (!isMockMode() && provider.capabilities().serverAgents && !dialAgent.externalAgentId) {
    const { syncAgent } = await import('../providers/sync');
    const sync = await syncAgent(agent.id);
    if (!sync.synced || !sync.externalAgentId) {
      throw new CallError(
        `Not dispatched: "${agent.name}" could not be published to ${provider.name}. ${sync.error ?? 'The sync failed.'}`,
        502
      );
    }
    dialAgent = (await db.agent.findUnique({ where: { id: agent.id } })) ?? agent;
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

  const dispatch = (a: typeof dialAgent) =>
    provider.startCall({
      to: contact.phone,
      externalAgentId: a.externalAgentId,
      config: agentToConfig(a),
      metadata: {
        callLogId: call.id,
        agentId: agent.id,
        contactId: contact.id,
        campaignId: contact.campaignId,
        customerName: contact.name,
      },
    });

  try {
    let result;
    try {
      result = await dispatch(dialAgent);
    } catch (err: any) {
      // Second line of defence for a stale provider-side id.
      //
      // The fingerprint check above catches a key rotation, but it cannot catch
      // an agent deleted on the provider's dashboard, or an id that went stale
      // some other way. Both surface identically here — "agent not found or
      // access denied" — and both are fixed by republishing. Matched on the
      // body rather than err.status because adapters map upstream codes onto
      // their own (OmniDimension's 404 can arrive as a 502).
      const text = `${err?.message ?? ''} ${err?.detail ?? ''}`;
      if (!dialAgent.externalAgentId || !/\(404\)|not[ _]?found|access denied|does not exist/i.test(text)) {
        throw err;
      }

      console.warn(`[call] ${agent.name}: provider does not know id ${dialAgent.externalAgentId}; republishing and retrying once.`);
      await db.agent.update({
        where: { id: agent.id },
        data: { externalAgentId: null, syncedAt: null },
      });
      const { syncAgent } = await import('../providers/sync');
      const resync = await syncAgent(agent.id);
      if (!resync.synced || !resync.externalAgentId) {
        throw new CallError(
          `Not dispatched: "${agent.name}" is unknown to ${provider.name} and could not be republished. ${resync.error ?? ''}`.trim(),
          502
        );
      }
      dialAgent = (await db.agent.findUnique({ where: { id: agent.id } })) ?? dialAgent;
      // Exactly one retry: if the freshly published id is also rejected, the
      // problem is not staleness and looping would only cost time.
      result = await dispatch(dialAgent);
    }

    await db.call.update({
      where: { id: call.id },
      data: {
        providerCallId: result.providerCallId,
        status: result.status,
        fromNumber: result.fromNumber ?? null,
      },
    });
    await db.auditLog.create({
      data: { action: 'call.started', entity: 'Call', entityId: call.id, userId: opts.user.id },
    });
    // Proof the account can pay for calls, which clears any standing
    // out-of-credit warning without anyone having to dismiss it.
    void noteDispatchOutcome(null);

    return { callId: call.id, status: result.status as CallStatus, mock: isMockMode() };
  } catch (err: any) {
    // Keep the provider's own detail — a generic message hides the fix.
    const detail = [err?.message, err?.detail].filter(Boolean).join(' — ').slice(0, 400);
    // "insufficient_balance" is the only credit fact this API will ever tell
    // us, so it is captured here and shown on the settings panel rather than
    // living only in one call's failure reason.
    void noteDispatchOutcome(detail);
    // "Not dispatched" is the honest framing: the call never reached the
    // network, so this is not a customer who declined. The call log shows this
    // string verbatim, which is the only place the cause is ever visible.
    const reason = `Not dispatched: ${detail || 'the provider rejected the call.'}`;

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
