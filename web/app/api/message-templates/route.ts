import { NextRequest, NextResponse } from 'next/server';
import { LeadStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { auditData } from '@/lib/audit';
import { requireUser } from '@/lib/auth';
import { assertOwner, errorResponse, requireCompany } from '@/lib/authz';
import { extractPlaceholders } from '@/lib/messaging/render';
import { WHATSAPP_TEXT_LIMIT } from '@/lib/messaging/whatsapp';
import { visibleTemplates } from '@/lib/messaging/send';

export const dynamic = 'force-dynamic';

const MAX_NAME = 120;

/** Row shape every handler here returns, before dates are stringified. */
interface TemplateRow {
  id: string;
  name: string;
  body: string;
  leadStatus: LeadStatus | null;
  isActive: boolean;
  createdById: string | null;
  createdBy: { id: string; name: string } | null;
  _count: { messages: number };
  createdAt: Date;
  updatedAt: Date;
}

function toDTO(row: TemplateRow) {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    leadStatus: row.leadStatus,
    isActive: row.isActive,
    createdById: row.createdById,
    createdBy: row.createdBy,
    messageCount: row._count.messages,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseLeadStatus(raw: unknown): LeadStatus | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  return (Object.values(LeadStatus) as string[]).includes(value) ? (value as LeadStatus) : null;
}

/** Shared validation for POST and PATCH. Returns an error message, or null. */
function checkBody(body: string): string | null {
  if (!body) return 'Write the message body first.';
  if (body.length > WHATSAPP_TEXT_LIMIT) {
    return `The body is ${body.length} characters; WhatsApp allows ${WHATSAPP_TEXT_LIMIT}.`;
  }
  const unknown = extractPlaceholders(body);
  if (unknown.length) {
    // A typo like {{customer name}} would be silently stripped at send time, so
    // the author never learns their merge field did nothing. Refuse the save.
    return `Unknown placeholder${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}. Use the insert menu instead.`;
  }
  return null;
}

/**
 * Templates the caller may use: every published one plus their own drafts.
 *
 * `?leadStatus=` narrows to the templates offered after a call with that
 * outcome — the ones tagged for it, plus the general-purpose ones.
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const where: Prisma.MessageTemplateWhereInput = { ...visibleTemplates(user) };

  const rawStatus = req.nextUrl.searchParams.get('leadStatus');
  if (rawStatus) {
    const leadStatus = parseLeadStatus(rawStatus);
    if (!leadStatus) {
      return NextResponse.json({ error: `Unknown lead status "${rawStatus}"` }, { status: 400 });
    }
    // AND, not another top-level OR: visibleTemplates already owns `OR` for
    // employees, and overwriting it would widen the scope instead of narrowing.
    where.AND = [{ OR: [{ leadStatus }, { leadStatus: null }] }];
  }

  if (req.nextUrl.searchParams.get('active') === '1') where.isActive = true;

  const templates = await db.messageTemplate.findMany({
    where,
    orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }],
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  return NextResponse.json(templates.map(toDTO));
}

/** Body: { name, body, leadStatus?, isActive? } */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const payload = await req.json().catch(() => ({}));

  const name = String(payload.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Give the template a name.' }, { status: 400 });
  if (name.length > MAX_NAME) {
    return NextResponse.json({ error: `The name is too long (${MAX_NAME} characters maximum).` }, { status: 400 });
  }

  const body = String(payload.body ?? '').trim();
  const invalid = checkBody(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  let leadStatus: LeadStatus | null = null;
  if (payload.leadStatus !== undefined && payload.leadStatus !== null && payload.leadStatus !== '') {
    leadStatus = parseLeadStatus(payload.leadStatus);
    if (!leadStatus) {
      return NextResponse.json({ error: `Unknown lead status "${String(payload.leadStatus)}"` }, { status: 400 });
    }
  }

  const companyId = requireCompany(user);
  const template = await db.messageTemplate.create({
    data: {
      name,
      body,
      leadStatus,
      isActive: payload.isActive === undefined ? true : Boolean(payload.isActive),
      createdById: user.id,
      companyId,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  await db.auditLog.create({
    data: auditData(user, {
      action: 'template.created',
      entity: 'MessageTemplate',
      entityId: template.id,
    }),
  });

  return NextResponse.json(toDTO(template), { status: 201 });
}

/** Body: { id, name?, body?, leadStatus?, isActive? } */
export async function PATCH(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const payload = await req.json().catch(() => ({}));
  const id = String(payload.id ?? '').trim();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await db.messageTemplate.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  try {
    assertOwner(user, existing.createdById, 'message templates');
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const data: Prisma.MessageTemplateUncheckedUpdateInput = {};

  if (payload.name !== undefined) {
    const name = String(payload.name).trim();
    if (!name) return NextResponse.json({ error: 'Give the template a name.' }, { status: 400 });
    if (name.length > MAX_NAME) {
      return NextResponse.json({ error: `The name is too long (${MAX_NAME} characters maximum).` }, { status: 400 });
    }
    data.name = name;
  }

  if (payload.body !== undefined) {
    const body = String(payload.body).trim();
    const invalid = checkBody(body);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
    data.body = body;
  }

  if (payload.leadStatus !== undefined) {
    if (payload.leadStatus === null || payload.leadStatus === '') {
      data.leadStatus = null;
    } else {
      const leadStatus = parseLeadStatus(payload.leadStatus);
      if (!leadStatus) {
        return NextResponse.json({ error: `Unknown lead status "${String(payload.leadStatus)}"` }, { status: 400 });
      }
      data.leadStatus = leadStatus;
    }
  }

  if (payload.isActive !== undefined) data.isActive = Boolean(payload.isActive);

  if (!Object.keys(data).length) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }

  const template = await db.messageTemplate.update({
    where: { id: existing.id },
    data,
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { messages: true } },
    },
  });

  await db.auditLog.create({
    data: auditData(user, {
      action: 'template.updated',
      entity: 'MessageTemplate',
      entityId: template.id,
    }),
  });

  return NextResponse.json(toDTO(template));
}

export async function DELETE(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const existing = await db.messageTemplate.findUnique({
    where: { id },
    select: { id: true, createdById: true },
  });
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });

  try {
    assertOwner(user, existing.createdById, 'message templates');
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  // Safe even when the template has been used: Message.templateId is
  // onDelete: SetNull, so sent messages keep their rendered body and simply lose
  // the back-reference. The record of what a customer received is never deleted.
  await db.messageTemplate.delete({ where: { id: existing.id } });

  await db.auditLog.create({
    data: auditData(user, {
      action: 'template.deleted',
      entity: 'MessageTemplate',
      entityId: existing.id,
    }),
  });

  return NextResponse.json({ ok: true });
}
