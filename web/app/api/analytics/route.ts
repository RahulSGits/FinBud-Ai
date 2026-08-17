import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { errorResponse } from '@/lib/authz';
import { computeAnalytics, parseAnalyticsQuery } from '@/lib/analytics';

export const dynamic = 'force-dynamic';

/**
 * Company-wide calling analytics. Admin only — this is the one place that
 * exposes one employee's numbers to another person.
 *
 * GET /api/analytics?days=7|30|90&employeeId=&agentId=
 *
 * The aggregation itself lives in lib/analytics so the admin page can render
 * the first payload server-side from exactly the same code; a route module
 * cannot export it (Next.js rejects non-route exports).
 */
export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAdmin();
  } catch (e) {
    const { body, status } = errorResponse(e);
    return NextResponse.json(body, { status });
  }

  try {
    const data = await computeAnalytics(
      parseAnalyticsQuery(req.nextUrl.searchParams, user.companyId ?? null)
    );
    return NextResponse.json(data);
  } catch (e) {
    console.error('analytics failed:', e);
    return NextResponse.json({ error: 'Could not load analytics' }, { status: 500 });
  }
}
