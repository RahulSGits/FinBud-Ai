'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PhoneCall, PhoneOff, Radio } from 'lucide-react';
import { Waveform, type WaveState } from './waveform';
import { freshnessLabel, useLiveRefresh } from '@/hooks/use-live-refresh';
import { cn } from '@/lib/utils';

export interface LiveCall {
  id: string;
  phone: string;
  name?: string | null;
  status: string;
  agentName?: string | null;
  startedAt?: string | null;
}

const LIVE_STATUSES = ['initiated', 'ringing', 'in_progress'];

function waveStateFor(status: string): WaveState {
  const s = status.toLowerCase();
  if (s === 'in_progress' || s === 'in-progress') return 'speaking';
  if (s === 'ringing' || s === 'initiated') return 'listening';
  return 'ended';
}

function elapsed(from?: string | null, now = Date.now()): string {
  if (!from) return '0:00';
  const secs = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * Live call rail.
 *
 * Polls rather than subscribes: calls change state every few seconds at most,
 * and polling survives a dropped connection without any reconnection logic.
 *
 * It polls *only* while a call is in flight. An idle dashboard left open on a
 * desk should make no requests at all — the provider sync behind each tick
 * costs quota, and there is nothing to learn when nothing is dialling. New work
 * arrives via the refresh that whatever started it already performs.
 */
export function LiveCallsPanel({
  initialCalls,
  liveCount,
}: {
  initialCalls: LiveCall[];
  /**
   * True number in flight, when the page knows it. The rail lists only the most
   * recent handful, so on a big campaign its own length would under-report.
   */
  liveCount?: number;
}) {
  const reduced = useReducedMotion() ?? false;
  const [now, setNow] = useState(() => Date.now());
  // Before the first tick lands, the data on screen is as old as this render.
  const [mountedAt] = useState(() => Date.now());

  // The prop is the source of truth, not merely a seed: every tick ends in
  // router.refresh(), so the server hands down the current rail each time.
  const calls = useMemo(
    () => initialCalls.filter((c) => LIVE_STATUSES.includes(c.status)),
    [initialCalls]
  );
  const active = calls.length > 0;
  const total = Math.max(liveCount ?? 0, calls.length);

  const onTick = useCallback(async () => {
    // Independent and both swallowed: a provider hiccup on the sync must not
    // also cost the campaign nudge, and neither must stop the refresh that
    // follows — the database has moved on regardless of what the vendor said.
    await Promise.all([
      // Pull finished results in from the provider.
      fetch('/api/calls/sync', { method: 'POST' }).catch(() => null),
      // An open dashboard is what advances campaigns between scheduled ticks,
      // so keep nudging the runner while calls are still flowing.
      fetch('/api/campaigns/tick', { method: 'POST' }).catch(() => null),
    ]);
  }, []);

  const { pending, lastUpdatedAt } = useLiveRefresh({
    enabled: active,
    intervalMs: 5000,
    onTick,
  });

  // One shared 1s clock driving both the elapsed timers and the freshness line.
  // It runs only while something is live, for the same reason the poll does.
  useEffect(() => {
    if (!active) return;
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(clock);
  }, [active]);

  return (
    <section
      aria-label="Live calls"
      className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden"
    >
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="relative flex w-2.5 h-2.5">
            {active && !reduced && (
              <span className="absolute inline-flex w-full h-full rounded-full bg-brand-400 opacity-75 animate-ping" />
            )}
            <span className={cn('relative inline-flex w-2.5 h-2.5 rounded-full', active ? 'bg-brand-500' : 'bg-slate-400 dark:bg-slate-600')} />
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Live calls</h2>
          <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            {active ? `${total} in progress` : 'none active'}
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {/* Says the view is current rather than abandoned — the difference
              between "nothing has happened" and "nothing is being fetched". */}
          {active && (
            <span
              title="This view refreshes itself every few seconds"
              className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400"
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  pending ? 'bg-brand-500 motion-safe:animate-pulse' : 'bg-emerald-500'
                )}
              />
              {freshnessLabel(lastUpdatedAt ?? mountedAt, now)}
            </span>
          )}
          <Radio className={cn('w-4 h-4', active ? 'text-brand-500' : 'text-slate-400 dark:text-slate-600')} />
        </div>
      </header>

      <AnimatePresence mode="popLayout" initial={false}>
        {active ? (
          <ul className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {calls.map((call) => (
              <motion.li
                key={call.id}
                layout={!reduced}
                initial={{ opacity: 0, y: reduced ? 0 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: reduced ? 0 : 8 }}
                className="flex items-center gap-4 px-5 py-3.5"
              >
                <div className="w-9 h-9 shrink-0 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
                  <PhoneCall className="w-4 h-4 text-brand-600 dark:text-brand-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                    {call.name || call.phone}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {call.agentName ? `${call.agentName} · ` : ''}
                    <span className="capitalize">{call.status.replace(/_/g, ' ')}</span>
                  </p>
                </div>
                <Waveform state={waveStateFor(call.status)} seed={call.id} bars={18} height={24} />
                <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400 w-11 text-right">
                  {elapsed(call.startedAt, now)}
                </span>
              </motion.li>
            ))}
          </ul>
        ) : (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 px-5 py-8">
            <PhoneOff className="w-5 h-5 text-slate-400 dark:text-slate-600 shrink-0" />
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No calls in progress</p>
              <p className="text-xs text-slate-500 dark:text-slate-500">
                Start a campaign and live calls appear here as they connect.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {total > calls.length && (
        <p className="px-5 py-2.5 border-t border-slate-200 dark:border-white/[0.06] text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
          +{total - calls.length} more in progress
        </p>
      )}
    </section>
  );
}
