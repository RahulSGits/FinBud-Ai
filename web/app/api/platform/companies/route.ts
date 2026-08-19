import { NextRequest, NextResponse } from 'next/server';
import { CompanyStatus, Role } from '@prisma/client';
import { db } from '@/lib/db';
import { DEFAULT_PASSWORD, hashPassword, requireUser, type SessionUser } from '@/lib/auth';
import { assertSuperAdmin, errorResponse } from '@/lib/authz';

export const dynamic = 'force-dynamic';

/** URL-safe handle, unique per company. */
function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

/**
 * Every company on the platform, with the counts the owner actually decides on.
 *
 * Aggregated in one grouped query per model rather than a count per company:
 * this page is the platform's front door and must not degrade as tenants are
 * added.
 */
export async function GET() {
  try {
    assertSuperAdmin(await requireUser());
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const [companies, users, agents, contacts, calls] = await Promise.all([
    db.company.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    db.user.groupBy({ by: ['companyId'], _count: true }),
    db.agent.groupBy({ by: ['companyId'], _count: true }),
    db.contact.groupBy({ by: ['companyId'], _count: true }),
    db.call.groupBy({ by: ['companyId'], _count: true }),
  ]);

  const tally = (rows: { companyId: string | null; _count: number }[]) =>
    new Map(rows.map((r) => [r.companyId, r._count]));
  const u = tally(users), a = tally(agents), c = tally(contacts), k = tally(calls);

  return NextResponse.json({
    companies: companies.map((co) => ({
      id: co.id,
      name: co.name,
      slug: co.slug,
      status: co.status,
      plan: co.plan,
      contactName: co.contactName,
      contactEmail: co.contactEmail,
      createdAt: co.createdAt,
      approvedAt: co.approvedAt,
      usage: {
        users: u.get(co.id) ?? 0,
        agents: a.get(co.id) ?? 0,
        contacts: c.get(co.id) ?? 0,
        calls: k.get(co.id) ?? 0,
      },
      limits: {
        maxUsers: co.maxUsers,
        maxAgents: co.maxAgents,
        maxCampaigns: co.maxCampaigns,
        maxContacts: co.maxContacts,
        maxCallsPerDay: co.maxCallsPerDay,
        maxCallMinutes: co.maxCallMinutes,
        maxConcurrent: co.maxConcurrent,
      },
    })),
  });
}

/**
 * Create a company and its first administrator, in one transaction.
 *
 * Both or neither: a company with no way to sign into it is not a usable
 * tenant, and cleaning that up by hand is exactly the sort of half-state that
 * goes unnoticed until somebody tries to onboard the customer.
 */
export async function POST(req: NextRequest) {
  let actor: SessionUser;
  try {
    actor = await requireUser();
    assertSuperAdmin(actor);
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const adminEmail = String(body.adminEmail ?? '').toLowerCase().trim();
  const adminName = String(body.adminName ?? '').trim() || 'Administrator';

  if (!name) return NextResponse.json({ error: 'Company name is required' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
    return NextResponse.json({ error: "That administrator email doesn't look valid" }, { status: 400 });
  }

  // Email is globally unique — one person belongs to one company — so a clash
  // is reported rather than surfacing as a raw constraint violation.
  if (await db.user.findUnique({ where: { email: adminEmail } })) {
    return NextResponse.json(
      { error: `${adminEmail} already has an account on the platform.` },
      { status: 409 }
    );
  }

  let slug = slugify(name) || 'company';
  if (await db.company.findUnique({ where: { slug } })) slug = `${slug}-${Date.now().toString(36)}`;

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const created = await db.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name,
        slug,
        status: CompanyStatus.active,
        approvedAt: new Date(),
        contactName: body.contactName ? String(body.contactName).slice(0, 160) : adminName,
        contactEmail: adminEmail,
        contactPhone: body.contactPhone ? String(body.contactPhone).slice(0, 40) : null,
        plan: body.plan ? String(body.plan).slice(0, 60) : null,
        maxUsers: body.maxUsers != null ? Number(body.maxUsers) : null,
        maxAgents: body.maxAgents != null ? Number(body.maxAgents) : null,
        maxContacts: body.maxContacts != null ? Number(body.maxContacts) : null,
        maxCallMinutes: body.maxCallMinutes != null ? Number(body.maxCallMinutes) : null,
      },
    });

    const admin = await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        role: Role.admin,
        status: 'active',
        companyId: company.id,
        passwordHash,
        // They sign in with the shared default once, then must replace it.
        mustChangePassword: true,
      },
    });

    await tx.auditLog.create({
      data: {
        action: 'company.created',
        entity: 'Company',
        entityId: company.id,
        userId: actor.id,
        meta: { name, slug, adminEmail },
      },
    });

    return { company, admin };
  });

  return NextResponse.json(
    {
      company: created.company,
      admin: { id: created.admin.id, email: created.admin.email },
      // Returned once, so the owner can pass it on. It is the shared default
      // and the account cannot do anything until it is changed.
      temporaryPassword: DEFAULT_PASSWORD,
    },
    { status: 201 }
  );
}
