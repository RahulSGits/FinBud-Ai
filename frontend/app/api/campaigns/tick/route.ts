import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-server';
import { tickAllCampaigns } from '@/lib/campaigns/runner';

export const dynamic = 'force-dynamic';

/**
 * Advance every running campaign by one tick.
 *
 * Two callers:
 *  - a scheduler (Vercel Cron / external cron) authenticating with
 *    `x-cron-secret: $CRON_SECRET`
 *  - a signed-in user, so the dashboard can nudge progress while open
 *
 * Idempotent and safe to call concurrently — the runner claims contacts with a
 * conditional update, so overlapping ticks cannot double-dial.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret');
  const expected = process.env.CRON_SECRET;

  let authorised = false;

  if (expected && secret) {
    authorised = secret === expected;
    if (!authorised) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  } else {
    const user = await getAuthUser();
    authorised = !!user?.organizationId;
  }

  if (!authorised) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results = await tickAllCampaigns();

  return NextResponse.json({
    ok: true,
    campaigns: results.length,
    dialled: results.reduce((sum, r) => sum + r.dialled, 0),
    results,
  });
}
