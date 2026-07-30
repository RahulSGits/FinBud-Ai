import { NextRequest, NextResponse } from 'next/server';
import { Role, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { AuthError, DEFAULT_PASSWORD, hashPassword, requireAdmin } from '@/lib/auth';

function deny(e: unknown) {
  const err = e as AuthError;
  return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
}

/** Everyone with an account, for the team screen. */
export async function GET() {
  try { await requireAdmin(); } catch (e) { return deny(e); }

  const users = await db.user.findMany({
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
    select: {
      id: true, name: true, email: true, employeeId: true, role: true, status: true,
      phone: true, department: true, designation: true, dailyCallLimit: true,
      mustChangePassword: true, lastLoginAt: true, createdAt: true,
      _count: { select: { assignedContacts: true } },
    },
  });
  return NextResponse.json(users);
}

/**
 * Create an employee account directly.
 *
 * Matches the spec's onboarding flow: the admin adds a person, the account is
 * created active with the shared default password `finbud@123`, and the person
 * is forced to change it on first login. No email round-trip required.
 */
export async function POST(req: NextRequest) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').toLowerCase().trim();
  const name = String(body.name ?? '').trim();
  const employeeId = String(body.employeeId ?? '').trim() || null;
  const role: Role = body.role === 'admin' ? Role.admin : Role.employee;
  const phone = String(body.phone ?? '').trim() || null;
  const department = String(body.department ?? '').trim() || null;
  const designation = String(body.designation ?? '').trim() || null;

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
  }

  const emailClash = await db.user.findUnique({ where: { email } });
  if (emailClash) {
    return NextResponse.json({ error: 'That email already has an account' }, { status: 409 });
  }
  if (employeeId) {
    const idClash = await db.user.findFirst({
      where: { employeeId: { equals: employeeId, mode: 'insensitive' } },
    });
    if (idClash) {
      return NextResponse.json(
        { error: `Employee ID "${employeeId}" is already assigned to ${idClash.name}.` },
        { status: 409 }
      );
    }
  }

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const user = await db.user.create({
    data: {
      email, name, employeeId, role, phone, department, designation,
      passwordHash,
      status: UserStatus.active,   // can log in immediately
      mustChangePassword: true,    // but forced to change first
    },
  });

  await db.auditLog.create({
    data: {
      action: 'employee.created', entity: 'User', entityId: user.id,
      userId: admin.id, meta: { email, employeeId, role },
    },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email, employeeId: user.employeeId, role: user.role },
    // The admin reads this out to the new employee.
    defaultPassword: DEFAULT_PASSWORD,
  }, { status: 201 });
}

/**
 * Update a member: role, status, call limit, profile fields, or reset their
 * password back to the shared default.
 */
export async function PATCH(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return deny(e); }

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? '');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const data: Record<string, unknown> = {};

  if (body.role !== undefined) {
    const role: Role = body.role === 'admin' ? Role.admin : Role.employee;
    // Never let the last admin demote themselves out of the platform.
    if (target.role === Role.admin && role !== Role.admin) {
      const admins = await db.user.count({ where: { role: Role.admin, status: UserStatus.active } });
      if (admins <= 1) {
        return NextResponse.json({ error: 'This is the only admin. Promote someone else first.' }, { status: 409 });
      }
    }
    data.role = role;
  }

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!Object.values(UserStatus).includes(status as UserStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (id === admin.id && status !== UserStatus.active) {
      return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 409 });
    }
    data.status = status;
  }

  if (body.dailyCallLimit !== undefined) {
    data.dailyCallLimit =
      body.dailyCallLimit === null || body.dailyCallLimit === '' ? null : Math.max(0, Number(body.dailyCallLimit) || 0);
  }
  for (const f of ['name', 'phone', 'department', 'designation'] as const) {
    if (body[f] !== undefined) data[f] = String(body[f]).trim() || null;
  }
  if (body.name !== undefined && !String(body.name).trim()) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  }

  // Resetting hands back the shared default and forces a change at next login.
  if (body.resetPassword) {
    data.passwordHash = await hashPassword(DEFAULT_PASSWORD);
    data.mustChangePassword = true;
    data.status = UserStatus.active;
  }

  const user = await db.user.update({ where: { id }, data });
  await db.auditLog.create({
    data: {
      action: body.resetPassword ? 'employee.password_reset' : 'employee.updated',
      entity: 'User', entityId: id, userId: admin.id, meta: { changed: Object.keys(data) },
    },
  });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, role: user.role, status: user.status, dailyCallLimit: user.dailyCallLimit },
    ...(body.resetPassword ? { defaultPassword: DEFAULT_PASSWORD } : {}),
  });
}

/**
 * Disable rather than delete: calls, contacts and audit rows reference users,
 * and a deleted member would silently orphan their history.
 */
export async function DELETE(req: NextRequest) {
  let admin;
  try { admin = await requireAdmin(); } catch (e) { return deny(e); }

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: 'You cannot disable your own account.' }, { status: 409 });
  }

  const target = await db.user.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  if (target.role === Role.admin) {
    const admins = await db.user.count({ where: { role: Role.admin, status: UserStatus.active } });
    if (admins <= 1) {
      return NextResponse.json({ error: 'This is the only admin. Promote someone else first.' }, { status: 409 });
    }
  }

  await db.user.update({ where: { id }, data: { status: UserStatus.disabled } });
  // Their leads go back to the unassigned pool rather than disappearing.
  await db.contact.updateMany({ where: { assignedToId: id }, data: { assignedToId: null } });

  await db.auditLog.create({
    data: { action: 'employee.disabled', entity: 'User', entityId: id, userId: admin.id },
  });
  return NextResponse.json({ ok: true });
}
