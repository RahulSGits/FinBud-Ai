import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUseAdminArea } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { DEFAULT_DAYS, computeAnalytics } from '@/lib/analytics';
import { AnalyticsDashboard } from '@/components/analytics/analytics-dashboard';

export const dynamic = 'force-dynamic';

/**
 * Employee- and agent-wise performance.
 *
 * Admin only, and re-checked here rather than trusting middleware — middleware
 * is routing, this is the boundary. The first payload is computed with the same
 * `computeAnalytics` the /api/analytics route uses, so the server render and
 * every later refetch cannot drift apart.
 */
export default async function AnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canUseAdminArea(user)) redirect('/dashboard');

  const initial = await computeAnalytics({
    days: DEFAULT_DAYS,
    employeeId: null,
    agentId: null,
    // From the session. A company admin sees their own company; the platform
    // owner has no company and sees across all of them.
    companyId: user.companyId ?? null,
  });

  return (
    <>
      <PageHeader
        title="Analytics"
        subtitle="Performance by employee and by AI agent, across the whole call record"
      />

      <div className="px-6 pb-10 space-y-6">
        <AnalyticsDashboard initial={initial} />
      </div>
    </>
  );
}
