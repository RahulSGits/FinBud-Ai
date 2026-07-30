// Shared motion tokens and variants.
//
// One source of truth so animation feels consistent across the product rather
// than each page inventing its own durations and easing.
//
// Durations follow the 150-300ms guidance for interaction feedback and stay
// under ~500ms for entrances — long enough to read as motion, short enough to
// never feel like waiting.
import type { Transition, Variants } from 'motion/react';

/** Expo-out. Fast departure, gentle settle — reads as "premium" rather than linear. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/** Symmetric ease for state changes that reverse (open/close). */
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const;

export const DURATION = {
  fast: 0.18,
  base: 0.32,
  slow: 0.5,
} as const;

/** Spring for tactile, physical feedback (press, drag, layout shifts). */
export const SPRING: Transition = {
  type: 'spring',
  mass: 1,
  damping: 20,
  stiffness: 140,
};

/** Snappier spring for small elements like badges and icons. */
export const SPRING_SNAPPY: Transition = {
  type: 'spring',
  mass: 0.6,
  damping: 18,
  stiffness: 260,
};

const base: Transition = { duration: DURATION.base, ease: EASE_OUT };

/**
 * Build variants for an entrance.
 *
 * When `reduced` is true the element still fades, but never translates or
 * scales — motion that conveys meaning is preserved while vestibular triggers
 * are removed. Returning empty/no-op variants instead would make content
 * appear abruptly, which is worse than a plain fade.
 */
export function fadeUp(reduced: boolean, distance = 20): Variants {
  return {
    hidden: { opacity: 0, y: reduced ? 0 : distance },
    show: { opacity: 1, y: 0, transition: base },
  };
}

export function fadeIn(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: base },
  };
}

export function scaleIn(reduced: boolean): Variants {
  return {
    hidden: { opacity: 0, scale: reduced ? 1 : 0.96 },
    show: { opacity: 1, scale: 1, transition: base },
  };
}

export function slideInX(reduced: boolean, distance = -20): Variants {
  return {
    hidden: { opacity: 0, x: reduced ? 0 : distance },
    show: { opacity: 1, x: 0, transition: base },
  };
}

/**
 * Parent container that staggers its children.
 * Stagger collapses to 0 under reduced motion so nothing is held back.
 */
export function staggerContainer(reduced: boolean, stagger = 0.08): Variants {
  return {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: reduced ? 0 : stagger,
        delayChildren: reduced ? 0 : 0.05,
      },
    },
  };
}

/** Shared viewport config for scroll-triggered reveals. */
export const VIEWPORT = { once: true, amount: 0.2 } as const;

/** Hover/press feedback for interactive cards. Disabled under reduced motion. */
export function interactive(reduced: boolean) {
  if (reduced) return {};
  return {
    whileHover: { y: -4, transition: { duration: DURATION.fast, ease: EASE_OUT } },
    whileTap: { scale: 0.98, transition: { duration: 0.1 } },
  };
}
