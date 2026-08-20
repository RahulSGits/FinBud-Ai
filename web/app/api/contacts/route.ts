import { NextRequest, NextResponse } from 'next/server';
import { ContactStatus, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { auditData } from '@/lib/audit';
import { AuthError, requireUser } from '@/lib/auth';
import { isAdmin, visibleContacts } from '@/lib/authz';
import { normalisePhone } from '@/lib/contacts/phone';

export async function GET(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const mine = req.nextUrl.searchParams.get('mine') === '1';
  const status = req.nextUrl.searchParams.get('status');
  const q = req.nextUrl.searchParams.get('q');

  // Starts from the scope helper rather than an empty object: this handler
  // built its own filter, so it would have been the one route that silently
  // ignored tenancy. visibleContacts already encodes both the company and the
  // employee-sees-their-own rule.
  const where: any = { ...visibleContacts(user) };
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

  // From the session, never the payload. An import must land in the importer's
  // own company, and a super admin has none to import into.
  const companyId = user.companyId;
  if (!companyId) {
    return NextResponse.json(
      { error: 'Select a company before importing contacts.' },
      { status: 400 }
    );
  }

  let created = 0, updated = 0, skippedNotYours = 0, skippedDoNotCall = 0;
  const invalid: string[] = [];

  for (const row of rows.slice(0, 5000)) {
    const phone = normalisePhone(row.phone);
    if (!phone) {
      if (row.phone) invalid.push(String(row.phone).slice(0, 24));
      continue;
    }

    // `undefined`, not `null`, for anything the sheet did not supply.
    //
    // Prisma writes an explicit null but skips undefined, so a phone-only
    // re-import used to blank the name, email, company and loan details of
    // rows a rep had spent weeks enriching — and the response called it
    // "updated". campaignId and customFields on this same object were already
    // guarded this way; the other five were not.
    const data = {
      name: row.name ? String(row.name).slice(0, 160) : undefined,
      email: row.email ? String(row.email).slice(0, 200) : undefined,
      company: row.company ? String(row.company).slice(0, 160) : undefined,
      loanType: row.loanType ? String(row.loanType).slice(0, 80) : undefined,
      loanAmount:
        row.loanAmount != null && row.loanAmount !== ''
          ? Number(row.loanAmount) || undefined
          : undefined,
      campaignId: body.campaignId || undefined,
      customFields: row.customFields ?? undefined,
    };

    // Upsert on (company, phone): re-importing a sheet updates rather than
    // duplicating, and never reaches another company's copy of the same lead.
    const existing = await db.contact.findUnique({
      where: { companyId_phone: { companyId, phone } },
      select: { id: true, assignedToId: true, status: true },
    });

    if (existing) {
      // Within a company, phone is unique — so importing a sheet containing a
      // colleague's lead would otherwise silently take it over, assignment and
      // all. An employee may only update leads already theirs; an admin may
      // update any. Either way the import never changes who a lead belongs to.
      if (!isAdmin(user) && existing.assignedToId !== user.id) {
        skippedNotYours++;
        continue;
      }
      // A contact who asked not to be called must not be quietly revived by
      // re-importing the sheet they were removed from.
      if (existing.status === ContactStatus.do_not_call) {
        skippedDoNotCall++;
        continue;
      }
      await db.contact.update({ where: { companyId_phone: { companyId, phone } }, data });
      updated++;
    } else {
      await db.contact.create({
        data: {
          ...data,
          phone,
          companyId,
          status: ContactStatus.pending,
          // Admins may hand an import to someone; an employee's import is
          // always their own, never assignable to a colleague.
          assignedToId: isAdmin(user) ? body.assignedToId || null : user.id,
        },
      });
      created++;
    }
  }

  await db.auditLog.create({
    data: auditData(user, {
      action: 'contacts.imported', entity: 'Contact', companyId,
      meta: { created, updated, invalid: invalid.length, skippedNotYours, skippedDoNotCall },
    }),
  });

  return NextResponse.json({
    ok: true, created, updated,
    skipped: invalid.length,
    // Surfaced so a bad column mapping is visible instead of silently dropping rows.
    invalidSamples: invalid.slice(0, 5),
    // Rows deliberately left alone. Reported separately from invalid ones so
    // "nothing happened to 40 of my rows" has an answer rather than a mystery.
    skippedNotYours,
    skippedDoNotCall,
  }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Scoped read before the write. Without this an employee could edit any lead
  // in the company by id — reassign it to themselves, or flip a do_not_call
  // contact back to pending, which is the guard lib/calls/place.ts relies on to
  // refuse dialling someone who asked us to stop.
  const existing = await db.contact.findFirst({
    where: { AND: [{ id }, visibleContacts(user)] },
    select: { id: true, status: true },
  });
  // 404 rather than 403: telling a stranger that a lead exists but is not
  // theirs is itself a disclosure.
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  const data: any = {};
  for (const f of ['name', 'email', 'company', 'loanType', 'status', 'campaignId']) {
    if (body[f] !== undefined) data[f] = body[f] || null;
  }
  if (body.loanAmount !== undefined) data.loanAmount = Number(body.loanAmount) || null;
  if (body.tags !== undefined) data.tags = Array.isArray(body.tags) ? body.tags : [];

  // Reassignment is an admin act. An employee moving a lead onto themselves —
  // or off themselves onto a colleague — rewrites someone else's pipeline, so
  // it is silently ignored rather than honoured.
  if (body.assignedToId !== undefined && isAdmin(user)) {
    data.assignedToId = body.assignedToId || null;
  }

  // Lifting do_not_call means overriding a person's explicit request to stop
  // being contacted. Only an admin may do that, and it is recorded.
  if (
    existing.status === ContactStatus.do_not_call &&
    data.status &&
    data.status !== ContactStatus.do_not_call
  ) {
    if (!isAdmin(user)) {
      return NextResponse.json(
        { error: 'Only an admin can take a contact off the do-not-call list.' },
        { status: 403 }
      );
    }
    await db.auditLog.create({
      data: auditData(user, {
        action: 'contact.do_not_call_lifted',
        entity: 'Contact',
        entityId: id,
        meta: { to: data.status },
      }),
    }).catch(() => undefined);
  }

  return NextResponse.json(await db.contact.update({ where: { id }, data }));
}

export async function DELETE(req: NextRequest) {
  let user;
  try { user = await requireUser(); } catch (e) {
    const err = e as AuthError; return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  // Deleting cascades to the contact's Notes and orphans its Calls, so the
  // ownership check matters more here than anywhere else in this file.
  const existing = await db.contact.findFirst({
    where: { AND: [{ id }, visibleContacts(user)] },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

  await db.contact.delete({ where: { id } });
  await db.auditLog.create({
    data: auditData(user, { action: 'contact.deleted', entity: 'Contact', entityId: id }),
  }).catch(() => undefined);

  return NextResponse.json({ ok: true });
}
