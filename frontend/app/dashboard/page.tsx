'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Phone, Users, TrendingUp, Clock, CheckCircle2, PhoneCall, Megaphone, Activity, PhoneIncoming, ArrowUpRight } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import Header from '@/components/dashboard/header';

export default function DashboardPage() {
  // Static dummy data for the UI
  const metrics = [
    { label: "Today's Calls", value: "248", icon: PhoneCall, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Answered", value: "192", icon: PhoneIncoming, color: "text-emerald-400", bg: "bg-emerald-500/10" },
    { label: "Success Rate", value: "34%", icon: TrendingUp, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Avg Duration", value: "2m 14s", icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
  ];

  const DAILY = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => ({
    day,
    calls: Math.round(1500 * [0.15,0.20,0.15,0.25,0.15,0.05,0.05][i]),
  }));

  return (
    <div className="min-h-screen pb-10">
      <Header title="Overview" subtitle="Monitor your AI agents and call performance in real-time" />

      <div className="p-6 space-y-6">
        
        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metrics.map(m => (
            <div key={m.label} className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-5 hover:border-emerald-500/10 transition-all group">
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-4', m.bg)}>
                <m.icon className={cn('w-5 h-5', m.color)} />
              </div>
              <div className="text-2xl font-bold text-slate-900 dark:text-white mb-1">{m.value}</div>
              <div className="text-xs text-slate-600 dark:text-slate-500">{m.label}</div>
            </div>
          ))}
        </div>

        {/* Charts & Top Performers */}
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Monthly Trend</h3>
              <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Calls</span>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={DAILY}>
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#475569', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0d1b2e', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', color: '#fff', fontSize: 12 }} />
                <Area type="monotone" dataKey="calls" stroke="#3b82f6" strokeWidth={2} fill="url(#cg)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6 flex flex-col">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Top Performing Agent</h3>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-white" />
              </div>
              <div className="text-lg font-bold text-slate-900 dark:text-white mb-1">Emma (Loan Recovery)</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mb-4">Success Rate: <span className="text-emerald-400 font-semibold">48%</span></div>
              <Link href="/dashboard/agents" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">View Agent Details <ArrowUpRight className="w-3 h-3" /></Link>
            </div>
          </div>
        </div>

        {/* Active Campaigns & Recent Calls */}
        <div className="grid lg:grid-cols-2 gap-5">
          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Megaphone className="w-4 h-4 text-slate-500" /> Active Campaigns</h3>
              <Link href="/dashboard/campaigns" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
            </div>
            <div className="space-y-3">
              {[
                { name: "Q3 Insurance Renewals", progress: 75, calls: "450/600" },
                { name: "Overdue EMI Collection", progress: 40, calls: "200/500" },
                { name: "Welcome Call (New Leads)", progress: 90, calls: "90/100" }
              ].map((campaign, i) => (
                <div key={i} className="p-3 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{campaign.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{campaign.calls} calls</span>
                  </div>
                  <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5">
                    <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${campaign.progress}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-4 h-4 text-slate-500" /> Recent Calls</h3>
              <Link href="/dashboard/calls" className="text-xs text-blue-400 hover:text-blue-300">View all</Link>
            </div>
            <div className="space-y-3">
              {[
                { name: "John Doe", phone: "+1 555-0100", status: "Interested", time: "2 mins ago" },
                { name: "Jane Smith", phone: "+1 555-0101", status: "No Answer", time: "15 mins ago" },
                { name: "Acme Corp", phone: "+1 555-0102", status: "Not Interested", time: "1 hour ago" }
              ].map((call, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
                      <Phone className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-white">{call.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{call.phone}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-xs font-semibold", call.status === "Interested" ? "text-emerald-400" : call.status === "No Answer" ? "text-amber-400" : "text-slate-500")}>{call.status}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{call.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
