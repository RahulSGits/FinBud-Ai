'use client';

// Lazy entry points for the chart components.
//
// components/analytics/charts.tsx imports recharts, which is around 150 kB
// gzipped — several times the weight of everything else on the screens that use
// it. Because a static import is part of the page's first-load bundle, every
// visitor was downloading and parsing the whole charting library before the
// page became interactive, even on the campaign screen, which uses a single
// donut a long way below the fold.
//
// Loading them through next/dynamic moves recharts into its own chunk that is
// fetched only once a chart is actually rendered. `ssr: false` because these
// draw from measured container dimensions and there is nothing useful to
// server-render; the skeleton below holds the layout so nothing jumps when the
// chunk lands.
//
// Only the components go through here. The pure helpers — OUTCOME_COLOUR,
// outcomeLabel, formatDuration — stay importable directly from ./chart-utils,
// which pulls in no recharts at all, so using a colour map never costs a
// charting library.
import dynamic from 'next/dynamic';

/** Holds the chart's footprint so the surrounding layout does not shift. */
function ChartSkeleton({ height = 280 }: { height?: number }) {
  return (
    <div
      style={{ height }}
      className="w-full rounded-xl bg-slate-100 dark:bg-white/5 motion-safe:animate-pulse"
      aria-hidden
    />
  );
}

export const DailyTrendChart = dynamic(
  () => import('./charts').then((m) => m.DailyTrendChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

export const EmployeeComparisonChart = dynamic(
  () => import('./charts').then((m) => m.EmployeeComparisonChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);

export const OutcomeDonut = dynamic(
  () => import('./charts').then((m) => m.OutcomeDonut),
  { ssr: false, loading: () => <ChartSkeleton height={260} /> }
);

export const AgentOutcomeChart = dynamic(
  () => import('./charts').then((m) => m.AgentOutcomeChart),
  { ssr: false, loading: () => <ChartSkeleton height={320} /> }
);
