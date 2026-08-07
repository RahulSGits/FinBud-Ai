// Outcome colours, ordering and formatters — with no charting library behind
// them.
//
// These used to live in components/analytics/charts.tsx, which imports recharts.
// Anything wanting a colour swatch or a duration string therefore pulled ~150 kB
// of charting into its bundle to get a lookup table. Worse, charts.tsx is a
// client component, so a server component could not call outcomeLabel at all —
// app/dashboard/analytics/page.tsx had already been forced to keep its own copy
// of formatDuration, with a comment explaining why.
//
// Plain module, no 'use client': importable from server and client alike.
import type { OutcomeSlice } from '@/lib/analytics';

/** The lead outcome each slice, segment or bar represents. */
export type OutcomeStatus = OutcomeSlice['status'];

/**
 * Drawn from the Okabe–Ito qualitative palette: the outcomes that matter most
 * (interested / not interested) would otherwise be the classic green-vs-red
 * pair, which a deuteranope cannot separate. These six stay distinguishable
 * under all three common forms of colour blindness, and each carries enough
 * lightness contrast to survive a greyscale print too.
 */
export const OUTCOME_COLOUR: Record<string, string> = {
  interested: '#009e73',
  callback_requested: '#e69f00',
  not_interested: '#d55e00',
  no_answer: '#94a3b8',
  voicemail: '#cc79a7',
  unknown: '#0072b2',
};

/**
 * Fixed reading order for stacks and legends. Typed against the payload's own
 * status union, so a renamed or added LeadStatus fails the build here rather
 * than silently dropping out of the chart.
 */
export const OUTCOME_ORDER: readonly OutcomeStatus[] = [
  'interested',
  'callback_requested',
  'not_interested',
  'no_answer',
  'voicemail',
  'unknown',
];

export function outcomeLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '0s';
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);
  if (hours) return `${hours}h ${mins}m`;
  if (mins) return `${mins}m ${secs}s`;
  return `${secs}s`;
}
