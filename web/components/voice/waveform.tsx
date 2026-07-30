'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export type WaveState = 'idle' | 'listening' | 'speaking' | 'ended';

interface WaveformProps {
  state?: WaveState;
  /** Stable string (e.g. call id) so two waveforms never animate in lockstep. */
  seed?: string;
  bars?: number;
  className?: string;
  /** Height in px of the tallest bar. */
  height?: number;
}

/** Deterministic pseudo-random in [0,1) so SSR and client agree. */
function seeded(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let c = 0; c < seed.length; c++) {
    h ^= seed.charCodeAt(c);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const STATE_COLOR: Record<WaveState, string> = {
  idle: 'bg-slate-300 dark:bg-slate-600',
  listening: 'bg-sky-500 dark:bg-sky-400',
  speaking: 'bg-brand-500 dark:bg-brand-400',
  ended: 'bg-slate-300 dark:bg-slate-700',
};

/**
 * Audio-style waveform for call state.
 *
 * Purely representational — it is not driven by real audio (the media never
 * reaches the browser for PSTN calls). It communicates *state*, so it must
 * never imply a level it doesn't know: `idle` and `ended` render flat.
 */
export function Waveform({
  state = 'idle',
  seed = 'wave',
  bars = 24,
  className,
  height = 28,
}: WaveformProps) {
  const reduced = useReducedMotion() ?? false;
  const active = state === 'listening' || state === 'speaking';

  const heights = useMemo(
    () =>
      Array.from({ length: bars }, (_, i) => {
        const r = seeded(seed, i);
        // Taper towards the edges so it reads as a clip, not a bar chart.
        const edge = Math.sin((i / (bars - 1)) * Math.PI);
        return 0.25 + r * 0.75 * edge;
      }),
    [bars, seed]
  );

  return (
    <div
      className={cn('flex items-center gap-[3px]', className)}
      style={{ height }}
      role="img"
      aria-label={
        state === 'speaking'
          ? 'Agent speaking'
          : state === 'listening'
          ? 'Customer speaking'
          : state === 'ended'
          ? 'Call ended'
          : 'No audio'
      }
    >
      {heights.map((h, i) => {
        const min = Math.max(2, height * 0.12);
        const max = Math.max(min, height * h);

        return (
          <motion.span
            key={i}
            className={cn('w-[3px] rounded-full', STATE_COLOR[state])}
            initial={false}
            animate={
              active && !reduced
                ? { height: [min, max, min * 1.4, max * 0.8, min] }
                : { height: active ? max * 0.6 : min }
            }
            transition={
              active && !reduced
                ? {
                    duration: 0.9 + seeded(seed, i + 100) * 0.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                    delay: i * 0.035,
                  }
                : { duration: 0.25 }
            }
          />
        );
      })}
    </div>
  );
}
