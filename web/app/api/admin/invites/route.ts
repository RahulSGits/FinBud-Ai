import { NextRequest, NextResponse } from 'next/server';
import { Role, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, createInviteToken, requireAdmin, type SessionUser } from '@/lib/auth';
import { requireCompany } from '@/lib/authz';
import { sendInviteEmail } from '@/lib/email';

const INVITE_TTL_HOURS = 48;

/** List pending and recent invites. */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const invites = await db.invite.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      createdAt: true,
      invitedBy: { select: { name: true } },
    },
  });

  return NextResponse.json(
    invites.map((i) => ({
      ...i,
      status: i.acceptedAt ? 'accepted' : i.expiresAt < new Date() ? 'expired' : 'pending',
    }))
  );
}

/**
 * Invite someone by email.
 * Body: { email, name, role?: "admin" | "employee" }
 */
export async function POST(req: NextRequest) {
  let admin: SessionUser;
  try {
    admin = await requireAdmin();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').toLowerCase().trim();
  const name = String(body.name ?? '').trim();
  const role: Role = body.role === 'admin' ? Role.admin : Role.employee;
  const employeeId = String(body.employeeId ?? '').trim() || null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  // Employee IDs must stay unique, so reject a clash before creating anything.
  if (employeeId) {
    const clash = await db.user.findFirst({
      where: { employeeId: { equals: employeeId, mode: 'insensitive' }, NOT: { email } },
    });
    if (clash) {
      return NextResponse.json(
        { error: `Employee ID "${employeeId}" is already assigned to ${clash.name}.` },
        { status: 409 }
      );
    }
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.status === UserStatus.active) {
    return NextResponse.json({ error: 'That email already has an active account' }, { status: 409 });
  }

  // An invite can only ever admit somebody to the inviter's own company.
  const companyId = requireCompany(admin);
  const { raw, hash } = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3_600_000);

  // Create the account in `invited` state and the invite together, so a user
  // row can never exist without a way to activate it.
  const user = await db.$transaction(async (tx) => {
    const u = existing
      ? await tx.user.update({ where: { id: existing.id }, data: { name, role, employeeId } })
      : await tx.user.create({
          data: { email, name, role, employeeId, status: UserStatus.invited, companyId },
        });

    // Supersede any outstanding invite for this address.
    await tx.invite.deleteMany({ where: { email, acceptedAt: null } });

    await tx.invite.create({
      data: { email, role, tokenHash: hash, expiresAt, invitedById: admin.id, companyId },
    });

    await tx.auditLog.create({
      data: {
        action: existing ? 'invite.resent' : 'invite.created',
        entity: 'User',
        entityId: u.id,
        meta: { email, role, employeeId },
        userId: admin.id,
      },
    });

    return u;
  });

  const result = await sendInviteEmail({
    to: email,
    name,
    token: raw,
    invitedByName: admin.name,
    expiresAt,
  });

  return NextResponse.json(
    {
      ok: true,
      userId: user.id,
      emailSent: result.sent,
      // Surfaced so an admin is never left believing an email went out when it
      // did not. The link still works.
      warning: result.sent ? undefined : result.reason,
      inviteUrl: result.fallbackUrl,
      expiresAt,
    },
    { status: 201 }
  );
}
