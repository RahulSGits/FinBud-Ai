'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Activity, Phone, TrendingUp, Megaphone } from 'lucide-react';
import { DURATION, EASE_OUT } from '@/lib/motion';
import { cn } from '@/lib/utils';

interface GlobalOperationsProps {
  liveCalls: number;
  calls24h: number;
  connectRate: number;
  runningCampaigns: number;
}

/**
 * Admin "Global Operations" panel.
 *
 * Text and globe sit in separate grid columns rather than stacked with
 * absolute positioning — the previous version overlapped the heading onto the
 * sphere at most widths.
 */
export function GlobalOperations({
  liveCalls,
  calls24h,
  connectRate,
  runningCampaigns,
}: GlobalOperationsProps) {
  const reduced = useReducedMotion() ?? false;

  const stats = [
    { label: 'Live now', value: String(liveCalls), icon: Activity, accent: liveCalls > 0 },
    { label: 'Calls (24h)', value: calls24h.toLocaleString(), icon: Phone, accent: false },
    { label: 'Connect rate', value: `${connectRate}%`, icon: TrendingUp, accent: false },
    { label: 'Running campaigns', value: String(runningCampaigns), icon: Megaphone, accent: false },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      className="glass-card rounded-3xl p-6 sm:p-8 h-full grid md:grid-cols-[1fr_auto] gap-8 items-center overflow-hidden"
    >
      {/* ── Content ─────────────────────────────────────────────── */}
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <span className="relative flex w-2 h-2">
            {liveCalls > 0 && !reduced && (
              <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            )}
            <span
              className={cn(
                'relative inline-flex w-2 h-2 rounded-full',
                liveCalls > 0 ? 'bg-emerald-500' : 'bg-slate-400 dark:bg-slate-500'
              )}
            />
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            {liveCalls > 0 ? 'Live' : 'Idle'}
          </span>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white mb-2">
          Global Operations
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-sm mb-6">
          {liveCalls > 0
            ? `${liveCalls} AI voice ${liveCalls === 1 ? 'agent is' : 'agents are'} on a call right now.`
            : 'No calls in progress. Start a campaign to see live activity here.'}
        </p>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0">
              <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                <s.icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{s.label}</span>
              </dt>
              <dd
                className={cn(
                  'text-xl font-bold tabular-nums',
                  s.accent ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                )}
              >
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Globe ───────────────────────────────────────────────── */}
      <div className="relative w-56 h-56 lg:w-64 lg:h-64 mx-auto shrink-0" aria-hidden="true">
        {/* Ambient glow */}
        <motion.div
          animate={reduced ? undefined : { scale: [1, 1.06, 1], opacity: [0.55, 0.8, 0.55] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-2 rounded-full bg-emerald-500/25 blur-3xl"
        />

        {/* Sphere body. Meridians scroll horizontally inside a clipped circle —
            rotating a radially symmetric gradient (the old approach) produced
            no visible motion at all. */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 32% 28%, #5eead4 0%, #14b8a6 38%, #0f766e 72%, #134e4a 100%)',
            boxShadow:
              'inset -18px -18px 36px rgba(0,0,0,0.45), inset 14px 14px 30px rgba(255,255,255,0.28), 0 0 42px rgba(16,185,129,0.35)',
          }}
        >
          {/* Longitude lines */}
          <motion.div
            animate={reduced ? undefined : { backgroundPositionX: ['0px', '96px'] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.22) 0px, rgba(255,255,255,0.22) 1px, transparent 1px, transparent 24px)',
              maskImage: 'radial-gradient(circle at 50% 50%, black 62%, transparent 78%)',
              WebkitMaskImage: 'radial-gradient(circle at 50% 50%, black 62%, transparent 78%)',
            }}
          />

          {/* Latitude lines — flattened ellipses read as curvature. */}
          <div className="absolute inset-0">
            {[22, 38, 50, 62, 78].map((top, i) => (
              <span
                key={top}
                className="absolute left-0 right-0 border-t border-white/20"
                style={{
                  top: `${top}%`,
                  borderRadius: '50%',
                  height: 1,
                  opacity: i === 2 ? 0.35 : 0.2,
                }}
              />
            ))}
          </div>

          {/* Terminator: soft shadow on the trailing edge for volume. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 72% 76%, rgba(0,0,0,0.35) 0%, transparent 58%)',
            }}
          />
        </div>

        {/* Specular highlight */}
        <div
          className="absolute rounded-full blur-xl"
          style={{
            top: '14%',
            left: '20%',
            width: '32%',
            height: '26%',
            background: 'rgba(255,255,255,0.5)',
          }}
        />
      </div>
    </motion.div>
  );
}
