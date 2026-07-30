import { NextRequest, NextResponse } from 'next/server';
import { ContactStatus, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { normalisePhone } from '@/lib/contacts/phone';

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const mine = req.nextUrl.searchParams.get('mine') === '1';
  const status = req.nextUrl.searchParams.get('status');
  const q = req.nextUrl.searchParams.get('q');

  // Employees see their own leads by default; admins see everything.
  const where: any = {};
  if (mine || user.role === Role.employee) where.assignedToId = user.id;
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q } },
      { company: { contains: q, mode: 'insensitive' } },
    ];
  }

  const contacts = await db.contact.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: {
      assignedTo: { select: { id: true, name: true } },
      campaign: { select: { id: true, name: true } },
      _count: { select: { calls: true } },
    },
  });
  return NextResponse.json(contacts);
}

/** Bulk upsert. Body: { contacts: [{name, phone, ...}], campaignId?, assignedToId? } */
export async function POST(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  const rows = Array.isArray(body.contacts) ? body.contacts : [];
  if (!rows.length) return NextResponse.json({ error: 'No contacts provided' }, { status: 400 });

  let created = 0, updated = 0;
  const invalid: string[] = [];

  for (const row of rows.slice(0, 5000)) {
    const phone = normalisePhone(row.phone);
    if (!phone) {
      if (row.phone) invalid.push(String(row.phone).slice(0, 24));
      continue;
    }

    const data = {
      name: row.name ? String(row.name).slice(0, 160) : null,
      email: row.email ? String(row.email).slice(0, 200) : null,
      company: row.company ? String(row.company).slice(0, 160) : null,
      loanType: row.loanType ? String(row.loanType).slice(0, 80) : null,
      loanAmount: row.loanAmount != null && row.loanAmount !== '' ? Number(row.loanAmount) || null : null,
      campaignId: body.campaignId || undefined,
      assignedToId: body.assignedToId || undefined,
      customFields: row.customFields ?? undefined,
    };

    // Upsert on phone: re-importing a sheet updates rather than duplicating.
    const existing = await db.contact.findUnique({ where: { phone } });
    if (existing) {
      await db.contact.update({ where: { phone }, data });
      updated++;
    } else {
      await db.contact.create({ data: { ...data, phone, status: ContactStatus.pending } });
      created++;
    }
  }

  await db.auditLog.create({
    data: {
      action: 'contacts.imported', entity: 'Contact', userId: user.id,
      meta: { created, updated, invalid: invalid.length },
    },
  });

  return NextResponse.json({
    ok: true, created, updated,
    skipped: invalid.length,
    // Surfaced so a bad column mapping is visible instead of silently dropping rows.
    invalidSamples: invalid.slice(0, 5),
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  try { await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const data: any = {};
  for (const f of ['name', 'email', 'company', 'loanType', 'status', 'assignedToId', 'campaignId']) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.loanAmount !== undefined) data.loanAmount = Number(body.loanAmount) || null;
  if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : [];

  return NextResponse.json(await db.contact.update({ where: { id: body.id }, data }));
}

export async function DELETE(req: NextRequest) {
  try { await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await db.contact.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
