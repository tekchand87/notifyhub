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
    <div className={`flex items-center justify-between text-xs ${className ?? ''}`}>
      <span className="text-surface-400 dark:text-surface-500">
        {total === 0
          ? 'No results'
          : `Showing ${start}–${end} of ${total} results`}
      </span>
      <div className="flex items-center gap-1">
        <PaginationButton
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </PaginationButton>
        <span className="px-2.5 py-1 text-surface-600 dark:text-surface-400 font-medium">
          Page {page} of {totalPages}
        </span>
        <PaginationButton
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
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
      className="p-1 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed
        border-surface-200 text-surface-600 hover:bg-surface-100 hover:border-surface-300
        dark:border-[#2a2d32] dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:border-surface-600"
    >
      {children}
    </button>
  );
}
