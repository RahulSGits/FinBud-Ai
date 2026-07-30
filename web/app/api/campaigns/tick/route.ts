import { NextRequest, NextResponse } from 'next/server';
import { Role } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth';
import { tickAllCampaigns } from '@/lib/campaigns/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

type Caller = 'cron' | 'admin' | 'employee' | null;

/**
 * Who is asking to advance the campaigns?
 *
 * Three ways in, because three very different things call this endpoint:
 *   - Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`.
 *   - Any other scheduler (crontab, GitHub Actions, Upstash) sends
 *     `x-cron-secret`, which is simpler to configure by hand.
 *   - The open dashboard polls it so a campaign visibly progresses while
 *     someone is watching, without a scheduler existing at all.
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

async function tick(req: NextRequest) {
  const who = await caller(req);
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const results = await tickAllCampaigns();

  return NextResponse.json({
    ok: true,
    campaigns: results.length,
    dialled: results.reduce((n, r) => n + r.dialled, 0),
    // Per-campaign detail carries every campaign's id, throughput and skip
    // reason — the whole company's dialling state. An employee session may
    // *drive* the tick (their own campaign needs it), but only schedulers and
    // admins get the breakdown back.
    ...(who === 'employee' ? {} : { results }),
  });
}

/** Vercel Cron only issues GET. */
export async function GET(req: NextRequest) {
  return tick(req);
}

export async function POST(req: NextRequest) {
  return tick(req);
}
