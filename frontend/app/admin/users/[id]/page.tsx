import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Building, Mail, Users, Phone, Megaphone, Activity, BarChart2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminUserDetailsPage({ params }: { params: { id: string } }) {
  const admin = await getAuthUser();
  if (!admin || admin.role !== 'admin') redirect('/dashboard');

  const user = await db.user.findUnique({
    where: { id: params.id },
    include: {
      organization: {
        include: {
          agents: { orderBy: { createdAt: 'desc' }, take: 5 },
          callLogs: { orderBy: { startedAt: 'desc' }, take: 5 },
          campaigns: { orderBy: { createdAt: 'desc' }, take: 5 },
          _count: {
            select: { agents: true, callLogs: true, campaigns: true }
          }
        }
      }
    }
  });

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500">
        <h1 className="text-xl font-bold mb-2">User Not Found</h1>
        <Link href="/admin/users" className="text-indigo-600 hover:underline">Return to User Management</Link>
      </div>
    );
  }

  const org = user.organization;
  const interestedLeads = await db.callLog.count({ where: { organizationId: org?.id, interested: true } });
  
  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/users" className="p-2 bg-white dark:bg-[#0f172a] rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{user.fullName}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
            <Mail className="w-4 h-4" /> {user.email} &bull; <Building className="w-4 h-4" /> {org?.name || 'No Org'} &bull; Role: {user.role.toUpperCase()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-3 text-indigo-500"><Users className="w-6 h-6" /></div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{org?._count.agents || 0}</h3>
          <p className="text-sm font-medium text-slate-500">AI Agents</p>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3 text-purple-500"><Megaphone className="w-6 h-6" /></div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{org?._count.campaigns || 0}</h3>
          <p className="text-sm font-medium text-slate-500">Campaigns</p>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-3 text-blue-500"><Phone className="w-6 h-6" /></div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{org?._count.callLogs || 0}</h3>
          <p className="text-sm font-medium text-slate-500">Total Calls</p>
        </div>
        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-3 text-amber-500"><BarChart2 className="w-6 h-6" /></div>
          <h3 className="text-3xl font-bold text-slate-900 dark:text-white">{interestedLeads}</h3>
          <p className="text-sm font-medium text-slate-500">Interested Leads</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-indigo-500" /> Recent AI Agents</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {org?.agents.map(a => (
              <div key={a.id} className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-900 dark:text-white">{a.name}</h4>
                  <p className="text-xs text-slate-500">{a.model} &bull; {a.voiceProvider}</p>
                </div>
                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {a.status}
                </span>
              </div>
            ))}
            {!org?.agents?.length && <div className="p-6 text-center text-sm text-slate-500">No AI agents created yet.</div>}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Phone className="w-4 h-4 text-blue-500" /> Recent Calls</h3>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {org?.callLogs.map(c => (
              <div key={c.id} className="p-4 flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-slate-900 dark:text-white">{c.phone}</h4>
                  <p className="text-xs text-slate-500">{new Date(c.startedAt).toLocaleString()}</p>
                </div>
                <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-full ${c.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                  {c.status}
                </span>
              </div>
            ))}
            {!org?.callLogs?.length && <div className="p-6 text-center text-sm text-slate-500">No calls made yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
