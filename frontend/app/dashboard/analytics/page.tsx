'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/dashboard/header';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';

const MONTHLY = [{ month: 'Aug', calls: 4200, interested: 945, revenue: 28400 }, { month: 'Sep', calls: 5800, interested: 1334, revenue: 35200 }, { month: 'Oct', calls: 7200, interested: 1728, revenue: 41800 }, { month: 'Nov', calls: 8100, interested: 2106, revenue: 45600 }, { month: 'Dec', calls: 7600, interested: 1824, revenue: 42300 }, { month: 'Jan', calls: 8921, interested: 2134, revenue: 48250 }];
const HOURLY = [{ hour: '8AM', rate: 52 }, { hour: '9AM', rate: 68 }, { hour: '10AM', rate: 82 }, { hour: '11AM', rate: 89 }, { hour: '12PM', rate: 71 }, { hour: '1PM', rate: 65 }, { hour: '2PM', rate: 74 }, { hour: '3PM', rate: 78 }, { hour: '4PM', rate: 72 }, { hour: '5PM', rate: 61 }];
const FALLBACK_METRICS = [{ label: 'Pickup Rate', value: '81.1%', change: '+3.2%', positive: true }, { label: 'Avg Duration', value: '3:07', change: '+0:22', positive: true }, { label: 'Conversion', value: '23.9%', change: '+2.1%', positive: true }, { label: 'Cost/Lead', value: '₹283', change: '-₹14.94', positive: true }, { label: 'Revenue/Call', value: '₹449', change: '+₹68.06', positive: true }, { label: 'No Answer', value: '18.9%', change: '-1.4%', positive: true }];

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<any[]>(FALLBACK_METRICS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/analytics');
        const data = await res.json();
        if (data.metrics) {
          setMetrics(data.metrics);
        }
      } catch (error) {
        console.error('Failed to load live analytics:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  return (
    <div className="min-h-screen">
      <Header title="Analytics & Reports" subtitle="Deep insights into your performance" />
      <div className="p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {metrics.map(m => (
              <div key={m.label} className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 rounded-xl p-4">
                <div className="text-lg font-bold text-slate-900 dark:text-white">{m.value}</div>
                <div className="text-[10px] text-slate-600 dark:text-slate-500">{m.label}</div>
                <div className={cn('text-xs font-medium flex items-center gap-0.5 mt-1', m.positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
                  {m.positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {m.change}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-5">Revenue & Calls Trend</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={MONTHLY}>
                <defs><linearGradient id="callsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.2)" /><XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: 12 }} />
                <Area type="monotone" dataKey="calls" stroke="#10b981" strokeWidth={2} fill="url(#callsGrad)" />
                <Area type="monotone" dataKey="interested" stroke="#06b6d4" strokeWidth={2} fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-5">Best Call Hours</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={HOURLY}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.2)" vertical={false} /><XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', color: '#fff', fontSize: 12 }} />
                <Bar dataKey="rate" fill="#10b981" radius={[4, 4, 0, 0]}>
                  {HOURLY.map((entry, i) => (<rect key={i} fill={entry.rate >= 80 ? '#10b981' : entry.rate >= 65 ? '#14b8a6' : '#1e3a5f'} />))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
