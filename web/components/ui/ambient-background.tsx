'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Soft ambient gradient blobs behind app content.
 *
 * Purely decorative, so it is aria-hidden and pointer-events-none. Kept subtle
 * — this sits behind working dashboards, not a marketing hero, so it must never
 * fight the data for attention. Animation is disabled under reduced motion.
 */
export function AmbientBackground({ className = '' }: { className?: string }) {
  const reduced = useReducedMotion() ?? false;

  const drift = (dx: number, dy: number, dur: number) =>
    reduced
      ? undefined
      : {
          x: [0, dx, 0],
          y: [0, dy, 0],
          transition: { duration: dur, repeat: Infinity, ease: 'easeInOut' as const },
        };

  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden ${className}`}
    >
      <motion.div
        animate={drift(40, -30, 22)}
        className="absolute -top-32 -left-24 w-[38rem] h-[38rem] rounded-full blur-[120px]
                   bg-brand-500/[0.10] dark:bg-brand-500/[0.13]"
      />
      <motion.div
        animate={drift(-50, 40, 27)}
        className="absolute top-1/3 -right-32 w-[34rem] h-[34rem] rounded-full blur-[120px]
                   bg-sky-400/[0.08] dark:bg-sky-500/[0.10]"
      />
      <motion.div
        animate={drift(30, 30, 31)}
        className="absolute -bottom-40 left-1/4 w-[40rem] h-[40rem] rounded-full blur-[130px]
                   bg-cyan-400/[0.06] dark:bg-indigo-500/[0.08]"
      />
      {/* Faint grid for depth. */}
      <div
        className="absolute inset-0 opacity-[0.4] dark:opacity-[0.25]"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgb(148 163 184 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(148 163 184 / 0.06) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black, transparent 75%)',
        }}
      />
    </div>
  );
}
