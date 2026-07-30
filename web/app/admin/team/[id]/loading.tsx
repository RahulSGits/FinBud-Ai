import { Skeleton } from '@/components/ui/skeleton';

/** Detail-shaped skeleton: header, tab bar, then the two-column card stack. */
export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <Skeleton className="h-6 w-44 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
      </div>

      <div className="flex items-center gap-1 p-1 mb-6 rounded-xl border border-slate-200 dark:border-white/10">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-lg" />
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {Array.from({ length: 2 }).map((_, col) => (
          <div key={col} className="space-y-6">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
                <Skeleton className="h-4 w-36 mb-2" />
                <Skeleton className="h-3 w-56 mb-5" />
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, r) => (
                    <div key={r} className="flex items-center justify-between gap-4">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
