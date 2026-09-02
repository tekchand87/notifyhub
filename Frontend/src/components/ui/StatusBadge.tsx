import { cn } from '@/lib/utils';

type Variant =
  | 'active'
  | 'inactive'
  | 'suspended'
  | 'queued'
  | 'processing'
  | 'delivered'
  | 'failed'
  | 'dlq'
  | 'tenant_admin'
  | 'member'
  | 'default';

const VARIANT_STYLES: Record<Variant, string> = {
  active:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  inactive:
    'bg-surface-50 text-surface-600 border-surface-200 dark:bg-surface-900 dark:text-surface-400 dark:border-surface-700',
  suspended:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  queued:
    'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800',
  processing:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800',
  delivered:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800',
  failed:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800',
  dlq: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800',
  tenant_admin:
    'bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950 dark:text-primary-300 dark:border-primary-800',
  member:
    'bg-surface-50 text-surface-600 border-surface-200 dark:bg-surface-900 dark:text-surface-400 dark:border-surface-700',
  default:
    'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:border-surface-700',
};

const LABEL_MAP: Partial<Record<string, string>> = {
  tenant_admin: 'Admin',
  dlq: 'DLQ',
};

interface StatusBadgeProps {
  value: string;
  className?: string;
}

export function StatusBadge({ value, className }: StatusBadgeProps) {
  const variant: Variant = (value as Variant) in VARIANT_STYLES ? (value as Variant) : 'default';
  const label = LABEL_MAP[value] ?? value.charAt(0).toUpperCase() + value.slice(1);

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-2xs font-medium border',
        VARIANT_STYLES[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return <StatusBadge value={isActive ? 'active' : 'inactive'} />;
}
