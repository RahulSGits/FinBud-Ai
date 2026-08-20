// Sending a WhatsApp follow-up.
//
// The counterpart to lib/calls/place.ts: one place that owns authorisation,
// compliance, rendering, persistence and delivery, so a message sent from the
// call drawer and one sent from a bulk selection are indistinguishable
// downstream. Routes stay thin and cannot forget a check.
import { ContactStatus, MessageStatus, Prisma } from '@prisma/client';
import { db } from '../db';
import { auditData } from '../audit';
import type { SessionUser } from '../auth';
import { isAdmin, visibleCalls, visibleContacts } from '../authz';
import { normalisePhone } from '../contacts/phone';
import { renderTemplate, type TemplateVars } from './render';
import { WHATSAPP_TEXT_LIMIT, WhatsAppError, isWhatsAppMockMode, sendWhatsAppText } from './whatsapp';

/** Most recipients one request may fan out to. */
export const BULK_LIMIT = 200;

/**
 * How many sends run at once inside a bulk request.
 *
 * Wide enough that 200 recipients finish inside the route's 60s budget, narrow
 * enough not to trip the Graph API's per-number throughput limits.
 */
const CONCURRENCY = 5;

export class MessageError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'MessageError';
  }
}

/**
 * Templates a caller may *use*: everything published, plus their own drafts.
 *
 * Mirrors `visibleAgents` in lib/authz — same "use anything published, change
 * only your own" rule, different table. It lives here rather than in lib/authz
 * because MessageTemplate arrived with this feature; the shape is deliberately
 * identical so it can move there unchanged later.
 */
export function visibleTemplates(user: SessionUser): Prisma.MessageTemplateWhereInput {
  if (isAdmin(user)) return {};
  return { OR: [{ isActive: true }, { createdById: user.id }] };
}

export interface SendMessageInput {
  user: SessionUser;
  contactId: string;
  templateId?: string | null;
  /** Raw body. Overrides the template's own text when both are given. */
  body?: string | null;
  /** The call this is following up, when there is one. */
  callId?: string | null;
}

export interface SendResult {
  contactId: string;
  contactName: string | null;
  /** E.164, or null when the send was refused before a number was resolved. */
  to: string | null;
  ok: boolean;
  /** Null only for refusals, where no Message row was ever created. */
  messageId: string | null;
  status: MessageStatus;
  error: string | null;
  mock: boolean;
}

// ---------------------------------------------------------------------------
// Rendering context
// ---------------------------------------------------------------------------

interface PlatformContext {
  companyName: string;
  timeZone: string;
}

/** Company name and calling timezone, from the same Setting rows the app uses. */
async function platformContext(): Promise<PlatformContext> {
  const rows = await db.setting.findMany({
    where: { key: { in: ['companyName', 'businessHours'] } },
  });

  let companyName = 'Finance Buddha';
  let timeZone = 'Asia/Kolkata';

  for (const row of rows) {
    if (row.key === 'companyName' && typeof row.value === 'string' && row.value.trim()) {
      companyName = row.value.trim();
    }
    if (row.key === 'businessHours' && row.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
      const tz = (row.value as Record<string, unknown>).tz;
      if (typeof tz === 'string' && tz.trim()) timeZone = tz.trim();
    }
  }

  return { companyName, timeZone };
}

/** The soonest callback an employee has actually booked on this lead. */
async function nextCallbackFor(contactId: string): Promise<Date | null> {
  const note = await db.note.findFirst({
    where: { contactId, callbackAt: { gte: new Date() } },
    orderBy: { callbackAt: 'asc' },
    select: { callbackAt: true },
  });
  return note?.callbackAt ?? null;
}

function formatCallback(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(at);
  } catch {
    // A hand-edited businessHours row can carry a timezone this server does not
    // recognise; a readable UTC stamp beats throwing mid-send.
    return at.toISOString();
  }
}

function describeFailure(e: unknown): string {
  if (e instanceof WhatsAppError) {
    return [e.message, e.detail].filter(Boolean).join(' — ').slice(0, 400);
  }
  return (e instanceof Error ? e.message : 'Delivery failed').slice(0, 400);
}

// ---------------------------------------------------------------------------
// Single send
// ---------------------------------------------------------------------------

/**
 * Render and deliver one message.
 *
 * Throws MessageError for anything that means nothing should be attempted at all
 * (not your lead, do-not-call, no template, body too long). A *delivery* failure
 * is not thrown — it comes back as `ok: false` on a persisted Message row, so
 * the UI can report it honestly and the record survives either way.
 */
export async function sendMessage(input: SendMessageInput): Promise<SendResult> {
  const { user } = input;
  const contactId = String(input.contactId ?? '').trim();
  if (!contactId) throw new MessageError('contactId is required.', 400);

  // Employees may only ever contact their own leads.
  const contact = await db.contact.findFirst({
    where: { id: contactId, ...visibleContacts(user) },
    select: {
      id: true, name: true, phone: true, company: true,
      loanType: true, loanAmount: true, status: true, companyId: true,
    },
  });
  if (!contact) {
    const exists = await db.contact.count({ where: { id: contactId } });
    throw new MessageError(
      exists ? 'That lead is not assigned to you.' : 'Contact not found.',
      exists ? 403 : 404
    );
  }

  // Compliance, not courtesy. A lead marked do_not_call has withdrawn consent —
  // under TRAI's UCC regulations messaging them anyway exposes the company to
  // penalties, so this refusal is absolute and is never a per-channel override.
  if (contact.status === ContactStatus.do_not_call) {
    throw new MessageError(
      `${contact.name ?? 'This lead'} asked not to be contacted again, so no message can be sent.`,
      409
    );
  }

  const to = normalisePhone(contact.phone);
  if (!to) {
    throw new MessageError('That lead has no phone number WhatsApp can deliver to.', 400);
  }

  const template = input.templateId
    ? await db.messageTemplate.findFirst({
        where: { id: String(input.templateId), ...visibleTemplates(user) },
        select: { id: true, body: true },
      })
    : null;
  if (input.templateId && !template) {
    throw new MessageError('Template not found, or it has not been published.', 404);
  }

  // A supplied body wins: staff routinely pick a template and then tweak a line
  // before sending. The templateId is still recorded, so reporting can tell
  // which template a message came from even when it was edited.
  const supplied = typeof input.body === 'string' ? input.body.trim() : '';
  const source = supplied || template?.body || '';
  if (!source) throw new MessageError('Pick a template or write a message first.', 400);

  const call = input.callId
    ? await db.call.findFirst({
        where: { id: String(input.callId), ...visibleCalls(user) },
        select: { id: true, agent: { select: { name: true } } },
      })
    : null;
  if (input.callId && !call) throw new MessageError('Call not found.', 404);

  const [platform, callbackAt] = await Promise.all([
    platformContext(),
    nextCallbackFor(contact.id),
  ]);

  const vars: TemplateVars = {
    customer_name: contact.name,
    phone: contact.phone,
    company: contact.company,
    loan_type: contact.loanType,
    loan_amount: contact.loanAmount,
    agent_name: call?.agent?.name ?? null,
    employee_name: user.name,
    company_name: platform.companyName,
    callback_time: callbackAt ? formatCallback(callbackAt, platform.timeZone) : null,
  };

  const rendered = renderTemplate(source, vars);
  if (!rendered) throw new MessageError('That template renders to an empty message.', 400);
  if (rendered.length > WHATSAPP_TEXT_LIMIT) {
    throw new MessageError(
      `The rendered message is ${rendered.length} characters; WhatsApp allows ${WHATSAPP_TEXT_LIMIT}.`,
      400
    );
  }

  // Persist before delivering. If the Graph call throws, times out, or the
  // process dies mid-flight, we still know a message was attempted, to whom, and
  // with exactly what text — the rendered body, not a template reference, since
  // templates get edited and a sent record must not change retroactively.
  const message = await db.message.create({
    data: {
      to,
      body: rendered,
      status: MessageStatus.queued,
      templateId: template?.id ?? null,
      contactId: contact.id,
      callId: call?.id ?? null,
      sentById: user.id,
      companyId: contact.companyId,
    },
    select: { id: true },
  });

  const mock = isWhatsAppMockMode();
  let result: SendResult;

  try {
    const { providerMessageId } = await sendWhatsAppText(to, rendered);
    await db.message.update({
      where: { id: message.id },
      data: {
        status: MessageStatus.sent,
        sentAt: new Date(),
        providerMessageId,
        error: null,
      },
    });
    result = {
      contactId: contact.id,
      contactName: contact.name,
      to,
      ok: true,
      messageId: message.id,
      status: MessageStatus.sent,
      error: null,
      mock,
    };
  } catch (e) {
    const reason = describeFailure(e);
    await db.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.failed, error: reason },
    });
    result = {
      contactId: contact.id,
      contactName: contact.name,
      to,
      ok: false,
      messageId: message.id,
      status: MessageStatus.failed,
      error: reason,
      mock,
    };
  }

  // One row per attempt. The outcome lives in meta rather than in a second
  // action name, so "what did this person send this lead" is a single query.
  const meta: Prisma.InputJsonObject = {
    to,
    contactId: contact.id,
    templateId: template?.id ?? null,
    callId: call?.id ?? null,
    status: result.status,
    error: result.error,
    mock,
  };

  await db.auditLog.create({
    data: auditData(user, {
      action: 'message.sent',
      entity: 'Message',
      entityId: message.id,
      meta,
    }),
  });

  return result;
}

// ---------------------------------------------------------------------------
// Bulk send
// ---------------------------------------------------------------------------

export interface SendBulkInput {
  user: SessionUser;
  contactIds: string[];
  templateId?: string | null;
  body?: string | null;
}

function dedupe(ids: unknown): string[] {
  const out: string[] = [];
  const seen: Record<string, true> = {};
  for (const raw of Array.isArray(ids) ? ids : []) {
    const id = String(raw ?? '').trim();
    if (!id || seen[id]) continue;
    seen[id] = true;
    out.push(id);
  }
  return out;
}

/**
 * Send the same template to several leads.
 *
 * Reuses sendMessage per recipient, so every rule above applies unchanged, and
 * returns one result per contact: a lead who has gone do-not-call since the list
 * was drawn is a single skipped row, not a reason to abandon the other 199.
 */
export async function sendBulk(input: SendBulkInput): Promise<SendResult[]> {
  const ids = dedupe(input.contactIds);
  if (!ids.length) throw new MessageError('Pick at least one lead to message.', 400);
  if (ids.length > BULK_LIMIT) {
    throw new MessageError(
      `Too many recipients (${ids.length}). Send to at most ${BULK_LIMIT} leads per request.`,
      400
    );
  }

  // Validate the shared inputs once. Otherwise a missing template would be
  // reported 200 times as a per-recipient failure instead of one clear error.
  if (input.templateId) {
    const template = await db.messageTemplate.findFirst({
      where: { id: String(input.templateId), ...visibleTemplates(input.user) },
      select: { id: true },
    });
    if (!template) throw new MessageError('Template not found, or it has not been published.', 404);
  }
  if (!input.templateId && !String(input.body ?? '').trim()) {
    throw new MessageError('Pick a template or write a message first.', 400);
  }

  const results: SendResult[] = [];

  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const batch = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.all(
      batch.map((contactId) =>
        sendMessage({
          user: input.user,
          contactId,
          templateId: input.templateId ?? null,
          body: input.body ?? null,
        }).catch((e: unknown) => refusal(contactId, e))
      )
    );
    for (const result of settled) results.push(result);
  }

  return results;
}

/** A per-recipient refusal, shaped like a result so bulk callers see one list. */
function refusal(contactId: string, e: unknown): SendResult {
  return {
    contactId,
    contactName: null,
    to: null,
    ok: false,
    messageId: null,
    status: MessageStatus.failed,
    error: e instanceof Error ? e.message : 'Could not send this message.',
    mock: isWhatsAppMockMode(),
  };
}
