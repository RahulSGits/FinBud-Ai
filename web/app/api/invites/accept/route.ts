import { NextRequest, NextResponse } from 'next/server';
import { UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { auditData } from '@/lib/audit';
import { createSession, hashPassword, hashToken, validatePassword } from '@/lib/auth';

/**
 * Validate an invite token without consuming it, so the set-password page can
 * show who it is for and fail early on an expired link.
 * GET /api/invites/accept?token=...
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) } });

  // One generic response for every failure mode — a caller must not be able to
  // distinguish "wrong token" from "expired" or "already used".
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 404 });
  }

  const user = await db.user.findUnique({
    where: { email: invite.email },
    select: { name: true, email: true },
  });

  return NextResponse.json({ valid: true, email: invite.email, name: user?.name ?? '' });
}

/**
 * Consume the invite and set the password.
 * Body: { token, password }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? '');
  const password = String(body.password ?? '');

  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 });

  const problem = validatePassword(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const invite = await db.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return NextResponse.json({ error: 'This invitation is invalid or has expired' }, { status: 404 });
  }

  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx) => {
    // Mark the invite consumed first and require it to still be unaccepted, so
    // two simultaneous submissions cannot both succeed.
    const claimed = await tx.invite.updateMany({
      where: { id: invite.id, acceptedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count === 0) throw new Error('ALREADY_ACCEPTED');

    const u = await tx.user.update({
      where: { email: invite.email },
      data: { passwordHash, status: UserStatus.active, role: invite.role },
    });

    await tx.auditLog.create({
      data: auditData(u, { action: 'invite.accepted', entity: 'User', entityId: u.id }),
    });

    return u;
  }).catch((e) => {
    if (e instanceof Error && e.message === 'ALREADY_ACCEPTED') return null;
    throw e;
  });

  if (!user) {
    return NextResponse.json({ error: 'This invitation has already been used' }, { status: 409 });
  }

  // Sign them straight in — requiring a separate login right after choosing a
  // password is friction with no security benefit.
  await createSession({ id: user.id, email: user.email, name: user.name, role: user.role });

  return NextResponse.json({
    ok: true,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
