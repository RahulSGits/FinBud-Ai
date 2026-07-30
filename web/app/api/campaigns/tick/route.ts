import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { tickAllCampaigns } from '@/lib/campaigns/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Is this caller allowed to advance the campaigns?
 *
 * Three ways in, because three very different things call this endpoint:
 *   - Vercel Cron sends GET with `Authorization: Bearer $CRON_SECRET`.
 *   - Any other scheduler (crontab, GitHub Actions, Upstash) sends
 *     `x-cron-secret`, which is simpler to configure by hand.
 *   - The open dashboard polls it so a campaign visibly progresses while
 *     someone is watching, without a scheduler existing at all.
 */
async function authorised(req: NextRequest): Promise<boolean> {
  const expected = process.env.CRON_SECRET;

  if (expected) {
    const bearer = req.headers.get('authorization');
    if (bearer === `Bearer ${expected}`) return true;
    if (req.headers.get('x-cron-secret') === expected) return true;
  }

  // Fall through to a session rather than failing: an unset CRON_SECRET must
  // not lock the dashboard out of its own polling.
  return !!(await getCurrentUser());
}

async function tick(req: NextRequest) {
  if (!(await authorised(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await tickAllCampaigns();
  return NextResponse.json({
    ok: true,
    campaigns: results.length,
    dialled: results.reduce((n, r) => n + r.dialled, 0),
    results,
  });
}

/** Vercel Cron only issues GET. */
export async function GET(req: NextRequest) {
  return tick(req);
}

export async function POST(req: NextRequest) {
  return tick(req);
}
