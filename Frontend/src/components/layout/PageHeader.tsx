import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 px-6 py-3.5',
        'border-b bg-white',
        'border-surface-200 dark:border-[#2a2d32] dark:bg-[#181a1d]',
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Amber accent bar */}
        <div className="w-0.5 h-5 bg-primary-600 rounded-full shrink-0" aria-hidden />
        <div className="min-w-0">
          <h1 className="text-sm font-semibold text-surface-900 dark:text-surface-100 truncate">
            {title}
          </h1>
          {description && (
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 truncate">
              {description}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
