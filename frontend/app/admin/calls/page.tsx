import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { PhoneCall } from 'lucide-react';
import { MotionWrapper, MotionList, MotionItem } from '@/components/admin/motion-wrapper';
import { CallMonitorChart } from '@/components/admin/call-monitor-charts';

export const dynamic = 'force-dynamic';

export default async function AdminCallsPage() {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') redirect('/dashboard');

  // Fetch recent calls
  const calls = await db.callLog.findMany({
    orderBy: { startedAt: 'desc' },
    take: 50,
    include: {
      organization: {
        select: { name: true }
      }
    }
  });

  // Calculate stats
  const totalCalls = calls.length;
  const avgDuration = totalCalls > 0 ? Math.round(calls.reduce((sum, c) => sum + c.duration, 0) / totalCalls) : 0;
  const totalCost = calls.reduce((sum, c) => sum + c.cost, 0);

  // Group by date for charts (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return d.toISOString().split('T')[0];
  }).reverse();

  const chartData = last7Days.map(date => {
    const count = calls.filter(c => {
      try {
        return c.startedAt.toISOString().split('T')[0] === date;
      } catch {
        return false;
      }
    }).length;
    return {
      date: new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      calls: count
    };
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <MotionWrapper>
        <div className="flex items-center gap-3">
          <PhoneCall className="w-8 h-8 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Call Monitor</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Real-time calls overview across the platform.</p>
          </div>
        </div>
      </MotionWrapper>

      <MotionList className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MotionItem className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Logged Calls</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{totalCalls}</p>
        </MotionItem>
        <MotionItem className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Avg Duration</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">{avgDuration}s</p>
        </MotionItem>
        <MotionItem className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Spend</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white mt-2">${totalCost.toFixed(2)}</p>
        </MotionItem>
      </MotionList>

      <MotionWrapper delay={0.2}>
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Call Analytics (Last 7 Days)</h3>
          <CallMonitorChart data={chartData} />
        </div>
      </MotionWrapper>

      <MotionWrapper delay={0.3}>
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6 overflow-hidden">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Recent Call Records</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">Organization</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Direction</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Cost</th>
                  <th className="py-3 px-4">Started At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300 text-sm">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                      {call.organization?.name || 'Unknown'}
                    </td>
                    <td className="py-3 px-4 font-mono">{call.phone}</td>
                    <td className="py-3 px-4 capitalize">{call.direction}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
                        call.status === 'completed' 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' 
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400'
                      }`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">{call.duration}s</td>
                    <td className="py-3 px-4">${call.cost.toFixed(2)}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {call.startedAt.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {calls.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No calls logged yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </MotionWrapper>
    </div>
  );
}
