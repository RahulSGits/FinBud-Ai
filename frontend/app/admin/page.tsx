import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { Users, Brain, Phone, MessageSquare, Megaphone, Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') redirect('/dashboard');

  // Perform parallel counts for global analytics
  const [
    totalUsers,
    totalAgents,
    activeAgents,
    totalCalls,
    totalCampaigns,
    interestedLeads,
  ] = await Promise.all([
    db.user.count(),
    db.agent.count(),
    db.agent.count({ where: { status: 'active' } }),
    db.callLog.count(),
    db.campaign.count(),
    db.callLog.count({ where: { interested: true } }),
  ]);

  const cards = [
    { title: 'Total Users', value: totalUsers, icon: Users, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
    { title: 'Total AI Agents', value: totalAgents, icon: Brain, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { title: 'Active Agents', value: activeAgents, icon: Activity, color: 'text-teal-500', bg: 'bg-teal-500/10' },
    { title: 'Total Calls', value: totalCalls, icon: Phone, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { title: 'Campaigns', value: totalCampaigns, icon: Megaphone, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { title: 'Interested Leads', value: interestedLeads, icon: MessageSquare, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Admin Overview</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Global platform analytics and statistics.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c, i) => (
          <div key={i} className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.bg}`}>
              <c.icon className={`w-6 h-6 ${c.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{c.title}</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{c.value.toLocaleString()}</h3>
            </div>
          </div>
        ))}
      </div>
      
      {/* Add more charts here in the future */}
      <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Platform Growth (Coming Soon)</h3>
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-white/5 rounded-xl">
          <p className="text-slate-500 dark:text-slate-400">Graphical charts will be rendered here.</p>
        </div>
      </div>
    </div>
  );
}
