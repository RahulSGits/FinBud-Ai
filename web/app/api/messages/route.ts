import { NextRequest, NextResponse } from 'next/server';
import { MessageStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { errorResponse, isAdmin, visibleContacts } from '@/lib/authz';
import { MessageError, type SendResult, sendBulk, sendMessage } from '@/lib/messaging/send';

export const dynamic = 'force-dynamic';

// A bulk send fans out to as many as 200 recipients over the network, so this
// needs the long budget the dialling routes use.
export const maxDuration = 60;

interface MessageRow {
  id: string;
  to: string;
  body: string;
  status: MessageStatus;
  error: string | null;
  providerMessageId: string | null;
  templateId: string | null;
  template: { id: string; name: string } | null;
  contactId: string | null;
  contact: { id: string; name: string | null; phone: string } | null;
  callId: string | null;
  sentById: string | null;
  sentBy: { id: string; name: string } | null;
  createdAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
}

function toDTO(row: MessageRow) {
  return {
    id: row.id,
    to: row.to,
    body: row.body,
    status: row.status,
    error: row.error,
    providerMessageId: row.providerMessageId,
    templateId: row.templateId,
    template: row.template,
    contactId: row.contactId,
    contact: row.contact,
    callId: row.callId,
    sentById: row.sentById,
    sentBy: row.sentBy,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString() : null,
  };
}

/**
 * Message history.
 *
 * `?contactId=` gives one lead's thread; without it, the caller's recent
 * messages across every lead they can see.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const contactId = req.nextUrl.searchParams.get('contactId');
  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 100, 500);

  const where: Prisma.MessageWhereInput = {};

  if (contactId) {
    // Resolved explicitly so an out-of-scope lead gets a real 403/404 rather
    // than an empty thread that looks like "no messages yet".
    const contact = await db.contact.findFirst({
      where: { id: contactId, ...visibleContacts(user) },
      select: { id: true },
    });
    if (!contact) {
      const exists = await db.contact.count({ where: { id: contactId } });
      return NextResponse.json(
        { error: exists ? 'That lead is not assigned to you.' : 'Contact not found.' },
        { status: exists ? 403 : 404 }
      );
    }
    where.contactId = contact.id;
  } else if (!isAdmin(user)) {
    // Admins see everything, including messages whose lead has since been
    // deleted; an employee's scope is exactly their own leads.
    where.contact = { is: visibleContacts(user) };
  }

  const messages = await db.message.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      template: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, phone: true } },
      sentBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(messages.map(toDTO));
}

function summarise(sent: number, failed: number, total: number): string {
  if (failed === 0) return `Sent to ${sent} lead${sent === 1 ? '' : 's'}.`;
  if (sent === 0) return `Could not send to ${failed} lead${failed === 1 ? '' : 's'}.`;
  return `Sent to ${sent} of ${total} leads; ${failed} failed.`;
}

/**
 * Send one message, or the same one to several leads.
 *
 * Body: { contactId | contactIds, templateId?, body?, callId? }
 *
 * The response always carries a per-recipient `results` array so the UI can name
 * exactly who was missed. The status code summarises it: 201 when everything
 * went out, 200 when some did, 502 when nothing did. Refusals that stop the
 * whole request (bad template, over the recipient cap) come back as a plain
 * error with their own status.
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const payload = await req.json().catch(() => ({}));

  const templateId = payload.templateId ? String(payload.templateId) : null;
  const body = typeof payload.body === 'string' ? payload.body : null;
  const callId = payload.callId ? String(payload.callId) : null;

  const many: string[] = Array.isArray(payload.contactIds)
    ? payload.contactIds.map((id: unknown) => String(id ?? '').trim()).filter(Boolean)
    : [];
  const one = payload.contactId ? String(payload.contactId).trim() : '';

  if (!many.length && !one) {
    return NextResponse.json({ error: 'Pick at least one lead to message.' }, { status: 400 });
  }

  let results: SendResult[];
  try {
    if (many.length > 1) {
      // A bulk send is not tied to one call, so callId is only carried on the
      // single path — including a one-element selection, which is a single send
      // wearing an array.
      results = await sendBulk({ user, contactIds: many, templateId, body });
    } else {
      const contactId = many.length === 1 ? many[0] : one;
      results = [await sendMessage({ user, contactId, templateId, body, callId })];
    }
  } catch (e) {
    if (e instanceof MessageError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('sendMessage failed:', e);
    return NextResponse.json({ error: 'Could not send the message.' }, { status: 500 });
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.length - sent;
  const message = summarise(sent, failed, results.length);

  if (sent === 0) {
    const firstError = results.find((r) => r.error)?.error ?? message;
    return NextResponse.json(
      { ok: false, sent, failed, message, error: firstError, results },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { ok: failed === 0, sent, failed, message, results },
    { status: failed === 0 ? 201 : 200 }
  );
}
