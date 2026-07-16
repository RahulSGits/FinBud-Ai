import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { ShieldAlert } from 'lucide-react';
import { MotionWrapper, MotionList, MotionItem } from '@/components/admin/motion-wrapper';
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
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-white/5 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Org</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">IP Address</th>
                  <th className="py-3 px-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-300 text-sm">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                      {log.user ? `${log.user.fullName} (${log.user.email})` : 'System'}
                    </td>
                    <td className="py-3 px-4">
                      {log.organization?.name || 'Global'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">{log.resource}</td>
                    <td className="py-3 px-4 font-mono text-xs">{log.ipAddress || 'N/A'}</td>
                    <td className="py-3 px-4 text-xs text-slate-500">
                      {log.createdAt.toLocaleString()}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No audit logs found.
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
