import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { AuthError, requireUser } from '@/lib/auth';
import { assertAdmin, errorResponse } from '@/lib/authz';
import { BALANCE_KEY, providerUsage } from '@/lib/providers/usage';

export const dynamic = 'force-dynamic';

/**
 * Voice-engine spend, and how much calling is left.
 *
 * Admin-only: this is billing. It is also a live call out to the engine, so it
 * is a route rather than part of the settings page render — a slow or
 * unreachable provider must not hold up the whole page.
 */
export async function GET() {
  let user;
  try {
    user = await requireUser();
    assertAdmin(user);
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  return NextResponse.json(await providerUsage());
}

/** Record the balance shown on the provider's own dashboard. */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireUser();
    assertAdmin(user);
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  const body = await req.json().catch(() => ({}));

  // Clearing is a real intent — a balance nobody maintains is worse than none,
  // because the remaining figure keeps being shown long after it stopped being
  // true.
  if (body.amount === null || body.amount === '') {
    await db.setting.deleteMany({ where: { key: BALANCE_KEY } });
    return NextResponse.json(await providerUsage());
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: 'Enter the balance as a number.' }, { status: 400 });
  }

  // Stamped now: spend is counted forward from this moment, so recording a
  // top-up resets the burn-down rather than continuing to subtract calls that
  // were already paid for.
  const value = { amount, recordedAt: new Date().toISOString() };
  await db.setting.upsert({
    where: { key: BALANCE_KEY },
    create: { key: BALANCE_KEY, value },
    update: { value },
  });

  await db.auditLog
    .create({
      data: {
        action: 'provider.balance_recorded',
        entity: 'Provider',
        entityId: 'omnidimension',
        userId: user.id,
        meta: { amount },
      },
    })
    .catch(() => undefined);

  return NextResponse.json(await providerUsage());
}
