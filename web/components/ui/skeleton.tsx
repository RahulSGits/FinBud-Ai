import { cn } from '@/lib/utils';

/** Shimmer placeholder used while server components stream in. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-lg bg-slate-200/70 dark:bg-white/[0.06]', className)}
    />
  );
}

/** Standard page skeleton: header, KPI row, then a table block. */
export function PageSkeleton({ stats = 4, rows = 6 }: { stats?: number; rows?: number }) {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-44 mb-2" />
      <Skeleton className="h-4 w-64 mb-6" />

      {stats > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: stats }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4">
              <Skeleton className="h-8 w-8 rounded-lg mb-3" />
              <Skeleton className="h-6 w-16 mb-2" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
          <Skeleton className="h-4 w-32" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-3.5 border-b border-slate-100 dark:border-white/[0.04] last:border-0">
            <Skeleton className="h-9 w-9 rounded-xl shrink-0" />
            <div className="flex-1 min-w-0">
              <Skeleton className="h-4 w-40 mb-1.5" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
