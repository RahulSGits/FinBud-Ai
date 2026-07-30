import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth';
import { errorResponse } from '@/lib/authz';
import { computeMyAnalytics, parseDays } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * The caller's own calling record.
 *
 * GET /api/analytics/mine?days=7|30|90 (clamped to 1..365)
 *
 * Open to any signed-in user, which is only safe because the scope is not
 * negotiable: the user id comes from the session and nothing else. There is
 * deliberately no `employeeId` parameter here — the company-wide view, and the
 * ability to name someone else, live on the admin-only /api/analytics.
 */
export async function GET(req: NextRequest) {
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  try {
    const days = parseDays(req.nextUrl.searchParams);
    const data = await computeMyAnalytics(userId, { days });
    return NextResponse.json(data);
  } catch (e) {
    console.error('my analytics failed:', e);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
