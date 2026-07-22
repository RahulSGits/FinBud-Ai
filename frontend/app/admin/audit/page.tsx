import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ShieldAlert } from 'lucide-react';
import { MotionWrapper, MotionList, MotionItem } from '@/components/motion-wrapper';
import { AuditLogChart } from '@/components/admin/audit-log-charts';

export const dynamic = 'force-dynamic';

export default async function AdminAuditPage() {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') redirect('/dashboard');

  // Fetch audit logs
  const auditLogs = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: {
      user: {
        select: {
          email: true,
          fullName: true
        }
      },
      organization: {
        select: {
          name: true
        }
      }
    }
  });

  // Calculate some aggregate action types for the pie chart
  const actionCounts = auditLogs.reduce((acc: Record<string, number>, log) => {
    const actionKey = log.action || 'unknown';
    acc[actionKey] = (acc[actionKey] || 0) + 1;
    return acc;
  }, {});

  const chartData = Object.entries(actionCounts).map(([name, value]) => ({
    name: name.replace(/_/g, ' ').toUpperCase(),
    value
  }));

  const totalLogs = auditLogs.length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <MotionWrapper>
        <div className="flex items-center gap-3">
          <ShieldAlert className="w-8 h-8 text-indigo-500" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Audit Logs</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Security and access auditing log history.</p>
          </div>
        </div>
      </MotionWrapper>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MotionWrapper delay={0.1} className="lg:col-span-2">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6 h-full flex flex-col justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Audit Overview</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Total processed audit records: {totalLogs}</p>
            </div>
            <div className="mt-4 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-white/5">
              <div className="text-center">
                <p className="text-5xl font-black text-indigo-500">{totalLogs}</p>
                <p className="text-xs uppercase tracking-wider font-bold text-slate-400 mt-1">Actions Recorded</p>
              </div>
            </div>
          </div>
        </MotionWrapper>

        <MotionWrapper delay={0.2}>
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Actions by Type</h3>
            {chartData.length > 0 ? (
              <AuditLogChart data={chartData} />
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500 text-sm">
                No logs recorded yet.
              </div>
            )}
          </div>
        </MotionWrapper>
      </div>

      <MotionWrapper delay={0.3}>
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6 overflow-hidden">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Audit History</h3>
          <MotionList className="flex flex-col gap-3">
            {auditLogs.length === 0 ? (
              <div className="py-12 text-center">
                <ShieldAlert className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <div className="text-slate-500">No audit logs found.</div>
              </div>
            ) : (
              auditLogs.map((log) => (
                <MotionItem key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl bg-slate-50 dark:bg-slate-800/20 border border-slate-100 dark:border-white/5 hover:border-indigo-500/30 transition-all gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {log.user ? log.user.fullName : 'System'}
                      </span>
                      <span className="text-xs text-slate-500">
                        {log.user ? `(${log.user.email})` : ''}
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-indigo-100 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {log.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span className="font-mono bg-slate-200 dark:bg-slate-900/50 px-1.5 py-0.5 rounded">
                        {log.resource}
                      </span>
                      <span>•</span>
                      <span>{log.organization?.name || 'Global'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-1">
                    <span className="font-mono text-xs text-slate-400">
                      {log.ipAddress || 'IP N/A'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {log.createdAt.toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
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
