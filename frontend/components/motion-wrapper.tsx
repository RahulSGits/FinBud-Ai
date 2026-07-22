'use client';

import { motion, useReducedMotion } from 'motion/react';
import { ReactNode } from 'react';
import {
  VIEWPORT,
  fadeUp,
  interactive,
  slideInX,
  staggerContainer,
} from '@/lib/motion';

interface MotionWrapperProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** Reveal on scroll instead of immediately on mount. */
  inView?: boolean;
}

/**
 * Entrance animation for a block of content.
 *
 * CSS `prefers-reduced-motion` rules do not reach JS-driven animations, so the
 * preference has to be read here explicitly — otherwise these transforms run
 * for users who asked the OS for no motion.
 */
export function MotionWrapper({
  children,
  delay = 0,
  className = '',
  inView = false,
}: MotionWrapperProps) {
  const reduced = useReducedMotion() ?? false;
  const variants = fadeUp(reduced);

  const activation = inView
    ? { whileInView: 'show' as const, viewport: VIEWPORT }
    : { animate: 'show' as const };

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      {...activation}
      transition={{ delay: reduced ? 0 : delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionList({
  children,
  className = '',
  inView = false,
}: {
  children: ReactNode;
  className?: string;
  inView?: boolean;
}) {
  const reduced = useReducedMotion() ?? false;

  const activation = inView
    ? { whileInView: 'show' as const, viewport: VIEWPORT }
    : { animate: 'show' as const };

  return (
    <motion.div
      variants={staggerContainer(reduced)}
      initial="hidden"
      {...activation}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function MotionItem({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion() ?? false;
  return (
    <motion.div variants={slideInX(reduced)} className={className}>
      {children}
    </motion.div>
  );
}

/** Card that lifts on hover and depresses on press. */
export function MotionCard({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      whileInView="show"
      viewport={VIEWPORT}
      transition={{ delay: reduced ? 0 : delay }}
      {...interactive(reduced)}
      className={className}
    >
      {children}
    </motion.div>
  );
}
