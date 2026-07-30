'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { PhoneCall, PhoneOff, Radio } from 'lucide-react';
import { Waveform, type WaveState } from './waveform';
import { cn } from '@/lib/utils';

export interface LiveCall {
  id: string;
  phone: string;
  name?: string | null;
  status: string;
  agentName?: string | null;
  startedAt?: string | null;
}

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
 * and polling survives a dropped connection without reconnection logic. It also
 * nudges the campaign runner, so an open dashboard keeps campaigns moving.
 */
export function LiveCallsPanel({ initialCalls }: { initialCalls: LiveCall[] }) {
  const reduced = useReducedMotion() ?? false;
  const [calls, setCalls] = useState<LiveCall[]>(initialCalls);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        // Advance any running campaign, then read the current state.
        await fetch('/api/campaigns/tick', { method: 'POST' }).catch(() => {});
        const res = await fetch('/api/calls?limit=100');
        if (!res.ok || cancelled) return;

        const all = await res.json();
        setCalls(
          all
            .filter((c: any) => ['initiated', 'ringing', 'in_progress'].includes(c.status))
            .map((c: any) => ({
              id: c.id,
              phone: c.phone,
              name: c.contact?.name ?? null,
              status: c.status,
              agentName: c.agent?.name ?? null,
              startedAt: c.startedAt,
            }))
        );
      } catch {
        // Ignore: the next tick will retry.
      }
    };

    const pollTimer = setInterval(poll, 4000);
    // Separate, faster timer so the elapsed clock ticks smoothly between polls.
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, []);

  const active = calls.length > 0;

  return (
    <section
      aria-label="Live calls"
      className="rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] overflow-hidden"
    >
      <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10">
        <div className="flex items-center gap-2.5">
          <span className="relative flex w-2.5 h-2.5">
            {active && !reduced && (
              <span className="absolute inline-flex w-full h-full rounded-full bg-brand-400 opacity-75 animate-ping" />
            )}
            <span className={cn('relative inline-flex w-2.5 h-2.5 rounded-full', active ? 'bg-brand-500' : 'bg-slate-400 dark:bg-slate-600')} />
          </span>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Live calls</h2>
          <span className="text-xs font-medium tabular-nums text-slate-500 dark:text-slate-400">
            {active ? `${calls.length} in progress` : 'none active'}
          </span>
        </div>
        <Radio className={cn('w-4 h-4', active ? 'text-brand-500' : 'text-slate-400 dark:text-slate-600')} />
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
    </section>
  );
}
