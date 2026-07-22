'use client';

import { MotionConfig } from 'motion/react';
import { ReactNode } from 'react';
import { DURATION, EASE_OUT } from '@/lib/motion';

/**
 * App-wide motion defaults.
 *
 * `reducedMotion="user"` makes every motion component honour the OS
 * "reduce motion" setting: transform and layout animations are dropped while
 * opacity still animates, so content never appears abruptly. CSS media queries
 * cannot do this for JS-driven animation, which is why it must live here.
 *
 * The default transition applies only to elements that don't declare their own,
 * so existing hand-tuned animations keep their timing.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      {children}
    </MotionConfig>
  );
}
