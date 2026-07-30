import { NextRequest, NextResponse } from 'next/server';
import { UserStatus } from '@prisma/client';
import { db, dbUnreachableMessage, isDbUnreachable } from '@/lib/db';
import { createSession, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    // Staff sign in with either their email address or their employee ID.
    const identifier = String(body.identifier ?? body.email ?? '').trim();
    const password = String(body.password ?? '');

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Email or employee ID and password are required' },
        { status: 400 }
      );
    }

    // Email is stored lowercase; employee IDs are matched case-insensitively
    // so "FB-014" and "fb-014" both work.
    const user = identifier.includes('@')
      ? await db.user.findUnique({ where: { email: identifier.toLowerCase() } })
      : await db.user.findFirst({
          where: { employeeId: { equals: identifier, mode: 'insensitive' } },
        });

    // Always compare, even when the user is missing, so response timing cannot
    // be used to enumerate accounts.
    const valid = await verifyPassword(password, user?.passwordHash ?? null);

    if (!user || !valid) {
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Distinguish these two only after the password checked out, so the states
    // aren't observable to an attacker guessing addresses.
    if (user.status === UserStatus.invited) {
      return NextResponse.json(
        { error: 'Finish setting up your account using the invitation link we emailed you.' },
        { status: 403 }
      );
    }

    if (user.status === UserStatus.disabled) {
      return NextResponse.json({ error: 'This account has been disabled.' }, { status: 403 });
    }

    await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });

    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await db.auditLog.create({
      data: { action: 'auth.login', entity: 'User', entityId: user.id, userId: user.id },
    });

    return NextResponse.json({
      ok: true,
      user: {
        id: user.id, email: user.email, name: user.name,
        role: user.role, employeeId: user.employeeId,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (e) {
    console.error('Login error:', e);
    // A dead database is an operator problem, not a credentials problem — say
    // which, or every misconfigured deploy reads as "wrong password".
    if (isDbUnreachable(e)) {
      return NextResponse.json({ error: dbUnreachableMessage() }, { status: 503 });
    }
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
