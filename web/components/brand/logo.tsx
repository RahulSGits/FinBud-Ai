import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Exact Finance Buddha logo (the icon files supplied by the company).
//   finance-buddha-light.png  — icon on a white ground, shown in light mode
//   finance-buddha-dark.png   — icon on a black ground, shown in dark mode
// Theme is selected purely with CSS (dark:), so this stays a server component
// with no hydration flicker.
// ---------------------------------------------------------------------------
const LIGHT_SRC = '/finance-buddha-light.png';
const DARK_SRC = '/finance-buddha-dark.png';

/**
 * The Finance Buddha meditating-figure mark, theme-aware.
 *
 * The supplied files carry a solid ground (white / black), so the wrapper is
 * rounded and clipped to read as a clean badge rather than a hard square, and
 * `rounded` can be overridden per placement.
 */
export function FinanceBuddhaMark({
  className,
  title = 'Finance Buddha',
  rounded = 'rounded-lg',
}: {
  className?: string;
  title?: string;
  rounded?: string;
}) {
  return (
    <span className={cn('relative inline-block shrink-0 overflow-hidden', rounded, className)}>
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src={LIGHT_SRC}
        alt={title}
        className="block dark:hidden w-full h-full object-cover"
      />
      <img
        src={DARK_SRC}
        alt=""
        aria-hidden
        className="hidden dark:block w-full h-full object-cover"
      />
      {/* eslint-enable @next/next/no-img-element */}
    </span>
  );
}

/** Full lockup: the exact mark + a crisp, theme-aware "Finance Buddha" wordmark. */
export function FinanceBuddhaLogo({
  className,
  showText = true,
  size = 'md',
}: {
  className?: string;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const markSize = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-11 h-11' }[size];
  const text = { sm: 'text-base', md: 'text-lg', lg: 'text-2xl' }[size];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <FinanceBuddhaMark className={markSize} />
      {showText && (
        <span className={cn('font-bold tracking-tight', text)}>
          <span className="text-brand-600 dark:text-brand-400">Finance</span>{' '}
          <span className="text-sky-500 dark:text-sky-400">Buddha</span>
        </span>
      )}
    </span>
  );
}
