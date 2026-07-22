'use client';

import { motion, useReducedMotion } from 'motion/react';
import { DURATION, EASE_OUT } from '@/lib/motion';

export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div
      initial={{ opacity: 0, y: reduced ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reduced ? 0 : -12 }}
      transition={{ duration: reduced ? 0.15 : DURATION.base, ease: EASE_OUT }}
      className="flex-1 flex flex-col h-full w-full"
    >
      {children}
    </motion.div>
  );
}
