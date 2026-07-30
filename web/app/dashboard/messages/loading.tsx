import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="px-6 pt-6 pb-10" role="status" aria-label="Loading">
      <span className="sr-only">Loading…</span>

      <Skeleton className="h-6 w-52 mb-2" />
      <Skeleton className="h-4 w-80 mb-6" />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Editor */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
            <Skeleton className="h-4 w-28 mb-2" />
            <Skeleton className="h-3 w-64" />
          </div>
          <div className="p-5 space-y-5">
            <Skeleton className="h-10 w-full rounded-xl" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
            <Skeleton className="h-44 w-full rounded-xl" />
            <div className="flex justify-end gap-2">
              <Skeleton className="h-9 w-24 rounded-xl" />
              <Skeleton className="h-9 w-36 rounded-xl" />
            </div>
          </div>
        </div>

        {/* Phone preview */}
        <div className="lg:col-span-2 space-y-3">
          <Skeleton className="h-[480px] w-full max-w-[340px] mx-auto rounded-[2.25rem]" />
          <Skeleton className="h-9 w-full max-w-[340px] mx-auto rounded-xl" />
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {[0, 1].map((group) => (
          <div key={group} className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-white/10">
              <Skeleton className="h-4 w-36 mb-2" />
              <Skeleton className="h-3 w-52" />
            </div>
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                className="flex items-start gap-4 px-5 py-4 border-b border-slate-100 dark:border-white/[0.04] last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <Skeleton className="h-4 w-56 mb-2" />
                  <Skeleton className="h-3 w-full max-w-md mb-2" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="h-9 w-20 rounded-xl shrink-0" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
