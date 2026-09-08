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
  | 'email'
  | 'webhook'
  | 'default';

// Semantic enterprise color mapping — muted, professional
const VARIANT_STYLES: Record<Variant, string> = {
  // ── Success / positive ───────────────────────────────
  active:
    'bg-success-50 text-success-700 border-success-200 dark:bg-success-950 dark:text-success-400 dark:border-success-800',
  delivered:
    'bg-success-50 text-success-700 border-success-200 dark:bg-success-950 dark:text-success-400 dark:border-success-800',

  // ── Warning / in-progress ────────────────────────────
  queued:
    'bg-warning-50 text-warning-700 border-warning-200 dark:bg-warning-950 dark:text-warning-400 dark:border-warning-800',
  processing:
    'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:border-surface-700',

  // ── Error / failure ──────────────────────────────────
  failed:
    'bg-error-50 text-error-700 border-error-200 dark:bg-error-950 dark:text-error-400 dark:border-error-800',
  dlq:
    'bg-error-50 text-error-700 border-error-200 dark:bg-error-950 dark:text-error-400 dark:border-error-800',
  suspended:
    'bg-error-50 text-error-700 border-error-200 dark:bg-error-950 dark:text-error-400 dark:border-error-800',

  // ── Neutral / inactive ───────────────────────────────
  inactive:
    'bg-surface-50 text-surface-500 border-surface-200 dark:bg-surface-900 dark:text-surface-500 dark:border-surface-700',
  member:
    'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:border-surface-700',

  // ── Amber accent — admin / brand role ────────────────
  tenant_admin:
    'bg-primary-50 text-primary-700 border-primary-200 dark:bg-primary-950 dark:text-primary-400 dark:border-primary-800',

  // ── Channel badges ───────────────────────────────────
  email:
    'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:border-surface-700',
  webhook:
    'bg-surface-100 text-surface-600 border-surface-200 dark:bg-surface-800 dark:text-surface-400 dark:border-surface-700',

  // ── Fallback ─────────────────────────────────────────
  default:
    'bg-surface-100 text-surface-500 border-surface-200 dark:bg-surface-800 dark:text-surface-500 dark:border-surface-700',
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
  const variant: Variant =
    (value as Variant) in VARIANT_STYLES ? (value as Variant) : 'default';
  const label =
    LABEL_MAP[value] ?? value.charAt(0).toUpperCase() + value.slice(1);

  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded-sm text-2xs font-medium border tracking-wide',
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
