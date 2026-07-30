import { Skeleton } from '@/components/ui/skeleton';

/**
 * Bespoke rather than PageSkeleton: this screen is a stat row, a tall chart, a
 * two-up block and a table, and a list-shaped placeholder would jump on swap.
 * It also stands in while the range control navigates.
 */
export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading my performance">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-44 mb-2" />
      <Skeleton className="h-4 w-96 mb-6" />

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
          <Skeleton className="h-4 w-32 mb-1.5" />
          <Skeleton className="h-3 w-60" />
        </div>
        <div className="p-5">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        {[0, 1].map((block) => (
          <div key={block} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <Skeleton className="h-4 w-36 mb-1.5" />
              <Skeleton className="h-3 w-52" />
            </div>
            <div className="p-5 space-y-3">
              <Skeleton className="h-2.5 w-full rounded-full" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <Skeleton className="h-2.5 w-2.5 rounded-full shrink-0" />
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3.5 w-10 ml-auto" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <Skeleton className="h-4 w-32 mb-1.5" />
          <Skeleton className="h-3 w-64" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0"
          >
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 min-w-0">
              <Skeleton className="h-4 w-36 mb-1.5" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-4 w-10 shrink-0" />
            <Skeleton className="h-1.5 w-16 rounded-full shrink-0" />
            <Skeleton className="h-1.5 w-16 rounded-full shrink-0" />
            <Skeleton className="h-4 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
