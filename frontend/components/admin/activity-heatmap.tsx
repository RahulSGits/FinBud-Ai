'use client';

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { motion } from 'motion/react';

const data = [
  { time: '00:00', activity: 120 },
  { time: '04:00', activity: 85 },
  { time: '08:00', activity: 340 },
  { time: '12:00', activity: 650 },
  { time: '16:00', activity: 820 },
  { time: '20:00', activity: 490 },
  { time: '23:59', activity: 210 },
];

export function ActivityHeatmap() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.3 }}
      className="w-full h-[300px] glass-card rounded-2xl p-6"
    >
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Platform Activity (24h)</h3>
        <p className="text-sm text-slate-500">Live timeline of user actions and automated calls.</p>
      </div>
      
      <div className="h-[200px] w-full mt-4">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorActivity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: 'none', color: '#fff' }}
              itemStyle={{ color: '#10b981' }}
            />
            <Area
              type="monotone"
              dataKey="activity"
              stroke="#10b981"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorActivity)"
              activeDot={{ r: 6, fill: '#10b981', stroke: '#0f172a', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
