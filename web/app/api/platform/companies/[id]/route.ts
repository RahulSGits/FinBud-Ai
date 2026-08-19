import { NextRequest, NextResponse } from 'next/server';
import { CompanyStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser, type SessionUser } from '@/lib/auth';
import { assertSuperAdmin, errorResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/** Limits the owner may set. Null means "no ceiling", which is why each is nullable. */
const LIMIT_FIELDS = [
  'maxUsers', 'maxAgents', 'maxCampaigns', 'maxContacts',
  'maxCallsPerDay', 'maxCallMinutes', 'maxConcurrent',
] as const;

/**
 * Read a limit from the request.
 *
 * Distinguishes three cases that are easy to collapse and expensive to get
 * wrong: absent (leave alone), explicitly null (remove the ceiling), and a
 * number (set it). Collapsing null into 0 would silently block a paying
 * customer from doing anything at all.
 */
function readLimit(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    assertSuperAdmin(await requireUser());
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const company = await db.company.findUnique({ where: { id: params.id } });
  if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const [users, agents, contacts, calls, campaigns, minutes] = await Promise.all([
    db.user.count({ where: { companyId: company.id } }),
    db.agent.count({ where: { companyId: company.id } }),
    db.contact.count({ where: { companyId: company.id } }),
    db.call.count({ where: { companyId: company.id } }),
    db.campaign.count({ where: { companyId: company.id } }),
    db.call.aggregate({ where: { companyId: company.id }, _sum: { durationSec: true } }),
  ]);

  return NextResponse.json({
    company,
    usage: {
      users, agents, contacts, calls, campaigns,
      // Rounded up: a part-minute still costs a minute upstream.
      callMinutes: Math.ceil((minutes._sum.durationSec ?? 0) / 60),
    },
  });
}

/** Change a company's status, plan or limits. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  let actor: SessionUser;
  try {
    actor = await requireUser();
    assertSuperAdmin(actor);
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const existing = await db.company.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  const changed: string[] = [];

  if (typeof body.name === 'string' && body.name.trim()) {
    data.name = body.name.trim();
    changed.push('name');
  }
  if (body.plan !== undefined) {
    data.plan = body.plan ? String(body.plan).slice(0, 60) : null;
    changed.push('plan');
  }

  if (body.status !== undefined) {
    const next = String(body.status);
    if (!Object.values(CompanyStatus).includes(next as CompanyStatus)) {
      return NextResponse.json({ error: `Unknown status "${next}"` }, { status: 400 });
    }
    data.status = next;
    changed.push(`status:${existing.status}->${next}`);
    // Approving for the first time is worth a timestamp; re-activating later is
    // not, or the record of when they joined would move.
    if (next === CompanyStatus.active && !existing.approvedAt) data.approvedAt = new Date();
  }

  for (const f of LIMIT_FIELDS) {
    const v = readLimit((body as Record<string, unknown>)[f]);
    if (v !== undefined) {
      data[f] = v;
      changed.push(`${f}=${v ?? 'unlimited'}`);
    }
  }

  if (!changed.length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });

  const company = await db.company.update({ where: { id: params.id }, data });

  await db.auditLog.create({
    data: {
      action: 'company.updated',
      entity: 'Company',
      entityId: company.id,
      userId: actor.id,
      // Not scoped to the company: this is a platform-owner action, and
      // AuditLog.companyId is nullable precisely for these.
      meta: { changed },
    },
  }).catch(() => undefined);

  return NextResponse.json({ company, changed });
}
