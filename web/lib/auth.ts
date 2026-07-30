// Authentication for the single-company deployment.
//
// There is no public sign-up. An admin invites an email address, Resend
// delivers a one-time link, and the recipient sets their own password. That is
// the only way an account comes into existence.
import { cookies } from 'next/headers';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { Role, UserStatus } from '@prisma/client';
import { db } from './db';

const COOKIE = 'finbud_session';

/** Password assigned to every employee the admin creates. */
export const DEFAULT_PASSWORD = 'finbud@123';
const SESSION_DAYS = 7;

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    // Failing loudly beats silently signing sessions with a guessable key.
    throw new Error('AUTH_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(s);
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  // Always run a comparison so response timing doesn't reveal whether an
  // account exists or has completed its invite.
  const target = hash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = await bcrypt.compare(plain, target);
  return hash ? ok : false;
}

/** Minimum viable password policy, enforced server-side. */
export function validatePassword(plain: string): string | null {
  if (plain.length < 10) return 'Password must be at least 10 characters.';
  if (!/[a-z]/.test(plain)) return 'Password must contain a lowercase letter.';
  if (!/[A-Z]/.test(plain)) return 'Password must contain an uppercase letter.';
  if (!/[0-9]/.test(plain)) return 'Password must contain a number.';
  return null;
}

// ---------------------------------------------------------------------------
// Invite tokens
// ---------------------------------------------------------------------------

/**
 * Generate an invite token. The raw value is emailed and never persisted; only
 * its SHA-256 hash is stored, so a database leak cannot be used to claim
 * pending accounts.
 */
export function createInviteToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

/** Constant-time comparison for token hashes. */
export function tokenMatches(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  employeeId?: string | null;
  mustChangePassword?: boolean;
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({ email: user.email, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export function destroySession(): void {
  cookies().delete(COOKIE);
}

/**
 * Resolve the signed-in user, or null.
 *
 * The database is checked on every request rather than trusting the JWT alone,
 * so disabling a user takes effect immediately instead of when their token
 * happens to expire.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;

    const user = await db.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, name: true, role: true, status: true,
        employeeId: true, mustChangePassword: true,
      },
    });

    if (!user || user.status !== UserStatus.active) return null;

    return {
      id: user.id, email: user.email, name: user.name, role: user.role,
      employeeId: user.employeeId, mustChangePassword: user.mustChangePassword,
    };
  } catch {
    return null;
  }
}

/** Throwing guards for route handlers. */
export class AuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Unauthorized', 401);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== Role.admin) throw new AuthError('Forbidden', 403);
  return user;
}
