import { Skeleton } from '@/components/ui/skeleton';

/**
 * Bespoke rather than PageSkeleton: this screen is a stat row, a tall chart and
 * two wide tables, and a placeholder shaped like a list would jump on swap.
 */
export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading analytics">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-32 mb-2" />
      <Skeleton className="h-4 w-80 mb-6" />

      <div className="flex items-center justify-between gap-3 mb-6">
        <Skeleton className="h-9 w-64 rounded-xl" />
        <Skeleton className="h-4 w-40" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
            <Skeleton className="h-8 w-8 rounded-lg mb-3" />
            <Skeleton className="h-6 w-16 mb-2" />
            <Skeleton className="h-3 w-20 mb-1.5" />
            <Skeleton className="h-2.5 w-24" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <Skeleton className="h-4 w-28 mb-1.5" />
          <Skeleton className="h-3 w-56" />
        </div>
        <div className="p-5">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>

      {[8, 5].map((rows, block) => (
        <div
          key={block}
          className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden mb-6 last:mb-0"
        >
          <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
            <Skeleton className="h-4 w-40 mb-1.5" />
            <Skeleton className="h-3 w-64" />
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0"
            >
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-36 mb-1.5" />
                <Skeleton className="h-3 w-20" />
              </div>
              <Skeleton className="h-4 w-10 shrink-0" />
              <Skeleton className="h-1.5 w-16 rounded-full shrink-0" />
              <Skeleton className="h-1.5 w-16 rounded-full shrink-0" />
              <Skeleton className="h-4 w-14 shrink-0" />
              <Skeleton className="h-4 w-14 shrink-0" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
