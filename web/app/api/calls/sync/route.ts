import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { reconcileInFlightCalls } from '@/lib/calls/reconcile';
import { republishStaleAgents } from '@/lib/providers/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Caller = 'cron' | 'admin' | 'employee' | null;

/**
 * Who is asking us to reconcile? Authorised exactly like /api/campaigns/tick,
 * because the same three things drive both:
 *   - Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`.
 *   - Any other scheduler (crontab, GitHub Actions, Upstash) sends
 *     `x-cron-secret`, which is simpler to configure by hand.
 *   - The open dashboard polls it, so a call recovers itself while somebody is
 *     watching even where no scheduler exists at all.
 */
async function caller(req: NextRequest): Promise<Caller> {
  const expected = process.env.CRON_SECRET;

  if (expected) {
    const bearer = req.headers.get('authorization');
    if (bearer === `Bearer ${expected}`) return 'cron';
    if (req.headers.get('x-cron-secret') === expected) return 'cron';
  }

  // Fall through to a session rather than failing: an unset CRON_SECRET must
  // not lock the dashboard out of its own polling.
  const user = await getCurrentUser();
  if (!user) return null;
  return user.role === Role.admin ? 'admin' : 'employee';
}

async function sync(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Republish before reconciling, on the same pass.
    //
    // Changing the provider API key invalidates every stored agent id. That was
    // already repaired lazily on the next dial, which is correct but invisible:
    // until somebody calls, the agents page reads "being republished" and the
    // provider's dashboard shows nothing, which is indistinguishable from a
    // fault. Doing it here means a key change heals on the schedule instead.
    //
    // Only schedulers and admins trigger it — an employee polling their lead
    // list should not be publishing agents — and a failure here must not cost
    // the reconcile that follows.
    const republished =
      who === 'employee'
        ? null
        : await republishStaleAgents().catch((e) => {
            console.error('[calls/sync] republish failed:', e);
            return null;
          });

    const { checked, updated, completed, errors, results } = await reconcileInFlightCalls();

    return NextResponse.json({
      ok: true,
      checked,
      updated,
      completed,
      errors,
      ...(republished && (republished.rotated || republished.published.length || republished.failed.length)
        ? { republished }
        : {}),
      // Per-call detail names every call in flight across the company, with the
      // provider id it is keyed by. An employee session may *drive* the sync
      // (their own campaign needs it), but only schedulers and admins get the
      // breakdown back.
      ...(who === 'employee' ? {} : { results }),
    });
  } catch (e) {
    console.error('[calls/sync]', e);
    return NextResponse.json({ error: 'Could not reconcile calls' }, { status: 500 });
  }
}

/** Vercel Cron only issues GET. */
export async function GET(req: NextRequest) {
  return sync(req);
}

export async function POST(req: NextRequest) {
  return sync(req);
}
