import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr
            className={cn(
              'border-b',
              'border-surface-200 bg-surface-50',
              'dark:border-[#2a2d32] dark:bg-[#111214]',
            )}
          >
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'table-header px-4 py-2 text-left whitespace-nowrap',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                )}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b transition-colors',
                'border-surface-100 dark:border-[#2a2d32]',
                // Subtle alternating rows — very faint
                i % 2 === 1 && 'bg-surface-50/50 dark:bg-[#111214]/40',
                onRowClick &&
                  'cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-950/20',
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    'px-4 py-2.5 text-surface-700 dark:text-surface-300 whitespace-nowrap',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
