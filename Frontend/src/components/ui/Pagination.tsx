import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Pagination as PaginationMeta } from '@/types';

interface PaginationProps {
  pagination: PaginationMeta;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ pagination, onPageChange, className }: PaginationProps) {
  const { page, totalPages, total, limit } = pagination;
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  return (
    <div className={`flex items-center justify-between text-sm ${className ?? ''}`}>
      <span className="text-surface-500 dark:text-surface-400">
        {total === 0 ? 'No results' : `${start}–${end} of ${total}`}
      </span>
      <div className="flex items-center gap-1">
        <PaginationButton
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </PaginationButton>
        <span className="px-2 text-surface-700 dark:text-surface-300">
          {page} / {totalPages}
        </span>
        <PaginationButton
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </PaginationButton>
      </div>
    </div>
  );
}

function PaginationButton({
  children,
  onClick,
  disabled,
  'aria-label': ariaLabel,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled: boolean;
  'aria-label': string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className="p-1 rounded border border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:bg-surface-100 dark:hover:bg-surface-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
