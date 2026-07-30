import { Skeleton } from '@/components/ui/skeleton';

/** Two sections of agent cards: the employee's own, then the company's. */
export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-40 mb-2" />
      <Skeleton className="h-4 w-56 mb-6" />

      <div className="space-y-6">
        {Array.from({ length: 2 }).map((_, section) => (
          <div key={section} className="space-y-3">
            <div>
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, card) => (
                <div key={card} className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <Skeleton className="h-9 w-9 rounded-xl" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-36 mb-2" />
                  <Skeleton className="h-3 w-full mb-1.5" />
                  <Skeleton className="h-3 w-2/3 mb-4" />
                  <div className="flex items-center gap-4 pt-3 border-t border-slate-100 dark:border-white/5">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
