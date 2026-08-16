import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { requireCompany } from '@/lib/authz';

function deny(e: unknown) {
  const err = e as AuthError;
  return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
}

/**
 * Employee follow-up notes and scheduled callbacks.
 *
 * ?contactId= scopes to one lead; without it, the caller's upcoming callbacks
 * are returned, which is what the "Upcoming callbacks" figure counts.
 */
export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) { return deny(e); }

  const contactId = req.nextUrl.searchParams.get('contactId');

  const where: any = contactId
    ? { contactId }
    : { authorId: user.id, callbackAt: { gte: new Date() } };

  // Employees only ever see notes on their own leads.
  if (user.role === Role.employee) where.contact = { assignedToId: user.id };

  const notes = await db.note.findMany({
    where,
    orderBy: contactId ? { createdAt: 'desc' } : { callbackAt: 'asc' },
    take: 200,
    include: {
      author: { select: { id: true, name: true } },
      contact: { select: { id: true, name: true, phone: true } },
    },
  });
  return NextResponse.json(notes);
}

/** Body: { contactId, body, callbackAt?, callId? } */
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) { return deny(e); }

  const payload = await req.json().catch(() => ({}));
  const contactId = String(payload.contactId ?? '');
  const text = String(payload.body ?? '').trim();

  if (!contactId) return NextResponse.json({ error: 'contactId is required' }, { status: 400 });
  if (!text) return NextResponse.json({ error: 'Write something first' }, { status: 400 });

  const contact = await db.contact.findUnique({ where: { id: contactId } });
  if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });
  if (user.role === Role.employee && contact.assignedToId !== user.id) {
    return NextResponse.json({ error: 'That lead is not assigned to you' }, { status: 403 });
  }

  let callbackAt: Date | null = null;
  if (payload.callbackAt) {
    const d = new Date(payload.callbackAt);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'callbackAt is not a valid date' }, { status: 400 });
    }
    callbackAt = d;
  }

  const companyId = requireCompany(user);
  const note = await db.note.create({
    data: {
      body: text.slice(0, 4000),
      contactId,
      callId: payload.callId ? String(payload.callId) : null,
      authorId: user.id,
      companyId,
      callbackAt,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  return NextResponse.json(note, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) { return deny(e); }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const note = await db.note.findUnique({ where: { id } });
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });
  // Authors delete their own notes; admins can delete any.
  if (user.role === Role.employee && note.authorId !== user.id) {
    return NextResponse.json({ error: 'That note is not yours' }, { status: 403 });
  }

  await db.note.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
