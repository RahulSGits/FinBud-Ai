'use client';

import { motion, useReducedMotion } from 'motion/react';
import { Children, isValidElement } from 'react';

/**
 * Wraps the landing sections and reveals any [data-reveal] element as it
 * scrolls into view. Respects prefers-reduced-motion (content just appears).
 *
 * Kept simple: it renders children directly and relies on CSS-in-JS via
 * whileInView on a wrapper per top-level child.
 */
export function HomeReveal({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion() ?? false;

  return (
    <>
      {Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child;
        return (
          <motion.div
            initial={reduced ? false : { opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: reduced ? 0 : Math.min(i * 0.05, 0.2) }}
          >
            {child}
          </motion.div>
        );
      })}
    </>
  );
}
