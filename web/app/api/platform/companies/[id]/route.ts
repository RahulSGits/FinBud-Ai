import { NextRequest, NextResponse } from 'next/server';
import { CompanyStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { auditData } from '@/lib/audit';
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

  // Only genuine differences are recorded. The editor sends every field on
  // every save, so counting what was *sent* claimed ten changes when three
  // happened — and that inflated list is what the audit log keeps. A trail that
  // overstates what changed is worse than none: it cannot be trusted the one
  // time somebody needs to know who altered a limit.
  if (typeof body.name === 'string' && body.name.trim() && body.name.trim() !== existing.name) {
    data.name = body.name.trim();
    changed.push(`name:${existing.name}->${body.name.trim()}`);
  }
  if (body.plan !== undefined) {
    const next = body.plan ? String(body.plan).slice(0, 60) : null;
    if (next !== existing.plan) {
      data.plan = next;
      changed.push(`plan:${existing.plan ?? 'none'}->${next ?? 'none'}`);
    }
  }

  if (body.status !== undefined) {
    const next = String(body.status);
    if (!Object.values(CompanyStatus).includes(next as CompanyStatus)) {
      return NextResponse.json({ error: `Unknown status "${next}"` }, { status: 400 });
    }
    if (next !== existing.status) {
      data.status = next;
      changed.push(`status:${existing.status}->${next}`);
      // Approving for the first time is worth a timestamp; re-activating later
      // is not, or the record of when they joined would move.
      if (next === CompanyStatus.active && !existing.approvedAt) data.approvedAt = new Date();
    }
  }

  for (const f of LIMIT_FIELDS) {
    const v = readLimit((body as Record<string, unknown>)[f]);
    if (v !== undefined && v !== existing[f]) {
      data[f] = v;
      changed.push(`${f}:${existing[f] ?? 'unlimited'}->${v ?? 'unlimited'}`);
    }
  }

  // Saving a form nobody edited is not an error, and refusing it would make
  // the editor look broken. It simply has nothing to record.
  if (!changed.length) {
    return NextResponse.json({ company: existing, changed: [] });
  }

  const company = await db.company.update({ where: { id: params.id }, data });

  await db.auditLog.create({
    data: auditData(actor, {
      action: 'company.updated',
      entity: 'Company',
      entityId: company.id,
      // Filed under the company, not the owner, who belongs to none. A plan
      // change or a suspension is that customer's history even though somebody
      // outside it made the change.
      companyId: company.id,
      meta: { changed },
    }),
  }).catch(() => undefined);

  return NextResponse.json({ company, changed });
}
