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
        'flex items-start justify-between gap-4 px-6 py-4 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900',
        className,
      )}
    >
      <div>
        <h1 className="text-base font-semibold text-surface-900 dark:text-surface-100">{title}</h1>
        {description && (
          <p className="mt-0.5 text-sm text-surface-500 dark:text-surface-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
