import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  AuthError, DEFAULT_PASSWORD, hashPassword, requireUser, validatePassword, verifyPassword,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  let user;
  try {
    // The one route that must work while a change is outstanding — it is the
    // way out of that state.
    user = await requireUser({ allowPendingPasswordChange: true });
  } catch (e) {
    const err = e as AuthError;
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }

  const { currentPassword, newPassword } = await req.json().catch(() => ({}));

  const row = await db.user.findUnique({ where: { id: user.id } });
  if (!row) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

  // Verify the current password (the default password counts as current on
  // first login).
  const ok = await verifyPassword(String(currentPassword ?? ''), row.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: 'Your current password is incorrect' }, { status: 400 });
  }

  const problem = validatePassword(String(newPassword ?? ''));
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  // The default password must never be reusable as the new password.
  if (String(newPassword) === DEFAULT_PASSWORD) {
    return NextResponse.json(
      { error: 'You cannot reuse the default password. Choose a new one.' },
      { status: 400 }
    );
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(String(newPassword)), mustChangePassword: false },
  });

  await db.auditLog.create({
    data: { action: 'password.changed', entity: 'User', entityId: user.id, userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
