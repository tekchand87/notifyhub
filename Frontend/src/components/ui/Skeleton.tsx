import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded bg-surface-200 dark:bg-surface-800',
        className,
      )}
      aria-hidden
    />
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-surface-100 dark:divide-[#2a2d32]" aria-busy aria-label="Loading">
      {Array.from({ length: rows }).map((_, ri) => (
        <div key={ri} className="flex items-center gap-4 px-4 py-2.5">
          {Array.from({ length: cols }).map((_, ci) => (
            <Skeleton
              key={ci}
              className={cn('h-3.5', ci === 0 ? 'w-28' : ci === cols - 1 ? 'w-16' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
