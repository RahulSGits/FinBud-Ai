import { CompanyStatus } from '@prisma/client';
import { cn } from '@/lib/utils';

/** One tint per status, defined once so every platform screen agrees. */
const TONE: Record<CompanyStatus, string> = {
  [CompanyStatus.active]: 'bg-brand-100 dark:bg-brand-500/10 text-brand-700 dark:text-brand-400',
  [CompanyStatus.pending]: 'bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400',
  [CompanyStatus.suspended]: 'bg-red-100 dark:bg-red-500/10 text-red-700 dark:text-red-400',
};

export function CompanyStatusBadge({ status, className }: { status: CompanyStatus; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize',
        TONE[status],
        className
      )}
    >
      {status}
    </span>
  );
}
