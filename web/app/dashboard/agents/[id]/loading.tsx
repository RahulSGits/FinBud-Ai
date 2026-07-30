import { Skeleton } from '@/components/ui/skeleton';

/** Builder-shaped skeleton: header, then the stack of prompt cards. */
export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-52 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />

      <div className="max-w-3xl space-y-6">
        <div className="rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5">
          <Skeleton className="h-4 w-40 mb-3" />
          <Skeleton className="h-16 w-full rounded-xl mb-3" />
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>

        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1 min-w-0">
                <Skeleton className="h-4 w-36 mb-1.5" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-24 rounded-lg shrink-0" />
            </div>
            <Skeleton className="h-20 w-full rounded-xl" />
          </div>
        ))}

        <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
          <Skeleton className="h-4 w-28 mb-4" />
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
