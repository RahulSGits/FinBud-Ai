import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { PhoneCall } from 'lucide-react';
import { MotionWrapper, MotionList, MotionItem } from '@/components/motion-wrapper';
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
          <MotionList className="flex flex-col gap-3">
            {calls.length === 0 ? (
              <div className="py-12 text-center">
                <PhoneCall className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="text-slate-500">No calls logged yet.</div>
              </div>
            ) : (
              calls.map((call) => (
                <MotionItem key={call.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-white/5 hover:border-indigo-500/30 transition-all gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {call.organization?.name || 'Unknown Org'}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {call.direction}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        call.status === 'completed' 
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400' 
                          : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400'
                      }`}>
                        {call.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono bg-slate-200 dark:bg-slate-900/50 px-1.5 py-0.5 rounded">
                        {call.phone}
                      </span>
                      <span>•</span>
                      <span>{call.duration}s</span>
                      <span>•</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        ${call.cost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <span className="text-xs text-slate-500">
                      {call.startedAt.toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                    <a href={`/admin/calls/${call.id}`} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                      View Details &rarr;
                    </a>
                  </div>
                </MotionItem>
              ))
            )}
          </MotionList>
        </div>
      </MotionWrapper>
    </div>
  );
}
