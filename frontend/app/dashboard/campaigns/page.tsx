'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Megaphone, Plus, PhoneForwarded, Users, CheckCircle, Loader2 } from 'lucide-react';

interface Campaign { id: string; name: string; status: string; totalContacts: number; contactsCalled: number; successCount: number; createdAt: string; }

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch('/api/campaigns');
    if (r.ok) setCampaigns(await r.json());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalDialed = campaigns.reduce((a, c) => a + c.contactsCalled, 0);
  const totalInterested = campaigns.reduce((a, c) => a + c.successCount, 0);
  const avgConv = totalDialed > 0 ? ((totalInterested / totalDialed) * 100).toFixed(1) : '0.0';

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-emerald-500" /> Auto-Dialer Campaigns
          </h1>
          <p className="text-slate-600 dark:text-slate-400">Batch call lists of customers automatically using your AI Agents.</p>
        </div>
        <Link href="/dashboard/campaigns/new">
          <button className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors">
            <Plus className="w-4 h-4" /> Create Campaign
          </button>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-[#0a1628] border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-3 text-emerald-600 dark:text-emerald-400 mb-2"><PhoneForwarded className="w-5 h-5" /><h3 className="font-semibold">Total Campaigns</h3></div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{campaigns.length}</div>
        </div>
        <div className="bg-white dark:bg-[#0a1628] border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-3 text-indigo-600 dark:text-indigo-400 mb-2"><Users className="w-5 h-5" /><h3 className="font-semibold">Contacts Dialed</h3></div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{totalDialed.toLocaleString('en-IN')}</div>
        </div>
        <div className="bg-white dark:bg-[#0a1628] border border-slate-200 dark:border-white/5 rounded-xl p-6">
          <div className="flex items-center gap-3 text-amber-500 mb-2"><CheckCircle className="w-5 h-5" /><h3 className="font-semibold">Avg. Conversion</h3></div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{avgConv}%</div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0a1628] border border-slate-200 dark:border-white/5 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 dark:text-slate-400" /></div>
        ) : campaigns.length === 0 ? (
          <div className="p-12 text-center">
            <Megaphone className="w-10 h-10 text-slate-600 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-slate-600 dark:text-slate-500 text-sm mb-4">No campaigns yet. Create one to auto-dial a contact list with an AI agent.</p>
            <Link href="/dashboard/campaigns/new"><button className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium inline-flex items-center gap-2"><Plus className="w-4 h-4" />Create Campaign</button></Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead className="bg-slate-50 dark:bg-white/5 border-b border-slate-200 dark:border-white/5">
                <tr>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Campaign Name</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Progress</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider">Interested</th>
                  <th className="px-6 py-4 text-xs font-semibold text-slate-600 dark:text-slate-500 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                {campaigns.map(camp => (
                  <tr key={camp.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900 dark:text-white">{camp.name}</div>
                      <div className="text-xs text-slate-600 dark:text-slate-500 mt-1">{new Date(camp.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        camp.status === 'completed' ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300' :
                        camp.status === 'running' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400' :
                        camp.status === 'stopped' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                        'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'}`}>
                        {camp.status === 'running' && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />}
                        {camp.status.charAt(0).toUpperCase() + camp.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden min-w-[80px]">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${camp.totalContacts ? (camp.contactsCalled / camp.totalContacts) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-slate-600 dark:text-slate-500 w-16 text-right">{camp.contactsCalled} / {camp.totalContacts}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{camp.successCount}{camp.contactsCalled > 0 && <span className="text-xs text-slate-600 dark:text-slate-500 font-normal ml-1">({Math.round((camp.successCount / camp.contactsCalled) * 100)}%)</span>}</div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link href={`/dashboard/campaigns/${camp.id}`}><button className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline font-medium">View Details</button></Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
