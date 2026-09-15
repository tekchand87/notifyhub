import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  Users,
  Building2,
  CheckCircle2,
  XCircle,
  Clock,
  Activity,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTenant } from '@/modules/tenant/hooks/useTenant';
import { useEvents } from '@/modules/events/hooks/useEvents';
import { useMembers } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDateShort } from '@/lib/utils';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';
import { healthApi, type KafkaStatus } from '@/api/health.api';

// ── Kafka health hook — polls every 30s ───────────────────────────────────────
function useKafkaHealth() {
  return useQuery({
    queryKey: ['kafka-health'],
    queryFn: () => healthApi.getKafkaHealth(),
    refetchInterval: 30_000,
    retry: 1,
    staleTime: 25_000,
  });
}

// Map Kafka status to the StatusRow "status" prop
function kafkaStatusToRowStatus(
  status: KafkaStatus | undefined,
  isLoading: boolean,
): 'operational' | 'degraded' | 'unknown' {
  if (isLoading) return 'unknown';
  if (status === 'healthy') return 'operational';
  if (status === 'unhealthy') return 'degraded';
  return 'unknown';
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const { data: eventsData, isLoading: eventsLoading } = useEvents({ limit: 10 });
  const { data: membersData, isLoading: membersLoading } = useMembers({ limit: 1 });
  const { data: kafkaHealth, isLoading: kafkaLoading, refetch: refetchKafka } = useKafkaHealth();
  const navigate = useNavigate();

  const isAdmin = user?.role === 'tenant_admin';

  const events = eventsData?.events ?? [];
  const totalEvents = eventsData?.pagination.total ?? 0;
  const deliveredCount = events.filter((e) => e.status === 'delivered').length;
  const failedCount = events.filter(
    (e) => e.status === 'failed' || e.status === 'dlq',
  ).length;
  const queuedCount = events.filter(
    (e) => e.status === 'queued' || e.status === 'processing' || e.status === 'retry_wait',
  ).length;
  const totalMembers = membersData?.pagination.total ?? 0;

  const kafkaRowStatus = kafkaStatusToRowStatus(kafkaHealth?.kafka.status, kafkaLoading);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user?.name ?? '—'}`}
      />

      <div className="p-6 space-y-5">
        {/* ── Metric strip ──────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
          <MetricWidget
            label="Total Events"
            value={eventsLoading ? null : totalEvents}
            icon={<Bell className="w-3.5 h-3.5" />}
            accent="amber"
            onClick={() => navigate(ROUTES.EVENTS)}
            clickable
          />
          <MetricWidget
            label="Delivered"
            value={eventsLoading ? null : deliveredCount}
            icon={<CheckCircle2 className="w-3.5 h-3.5" />}
            accent="green"
            sub="last 10 events"
          />
          <MetricWidget
            label="Failed / DLQ"
            value={eventsLoading ? null : failedCount}
            icon={<XCircle className="w-3.5 h-3.5" />}
            accent="red"
            sub="last 10 events"
          />
          <MetricWidget
            label="Queued / Retrying"
            value={eventsLoading ? null : queuedCount}
            icon={<Clock className="w-3.5 h-3.5" />}
            accent="neutral"
            sub="last 10 events"
          />
          {isAdmin ? (
            <MetricWidget
              label="Members"
              value={membersLoading ? null : totalMembers}
              icon={<Users className="w-3.5 h-3.5" />}
              accent="neutral"
              onClick={() => navigate(ROUTES.MEMBERS)}
              clickable
            />
          ) : (
            <MetricWidget
              label="Tenant Status"
              value={tenantLoading ? null : (tenant?.status ?? '—')}
              icon={<Building2 className="w-3.5 h-3.5" />}
              accent="neutral"
              isStatus
            />
          )}
        </div>

        {/* ── Main grid ─────────────────────────────────── */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Recent Events */}
          <div className="lg:col-span-2 card overflow-hidden">
            <div
              className={cn(
                'flex items-center justify-between px-4 py-3 border-b',
                'border-surface-100 dark:border-[#2a2d32]',
              )}
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-surface-400" />
                <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                  Recent Events
                </h2>
              </div>
              <button
                onClick={() => navigate(ROUTES.EVENTS)}
                className="flex items-center gap-1 text-2xs text-primary-700 hover:text-primary-800 dark:text-primary-400 font-medium"
              >
                View all
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            {eventsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Bell className="w-8 h-8 text-surface-300 dark:text-surface-700" />
                <p className="text-sm text-surface-400 dark:text-surface-500">
                  No events published yet
                </p>
              </div>
            ) : (
              <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_160px_100px_80px] gap-2 px-4 py-2 bg-surface-50 dark:bg-[#111214]">
                  <span className="table-header">Type</span>
                  <span className="table-header">Channel</span>
                  <span className="table-header">Status</span>
                  <span className="table-header text-right">Time</span>
                </div>
                {events.slice(0, 8).map((ev) => (
                  <div
                    key={ev._id}
                    className={cn(
                      'grid grid-cols-[1fr_160px_100px_80px] gap-2 px-4 py-2.5 items-center',
                      'cursor-pointer transition-colors',
                      'hover:bg-primary-50/50 dark:hover:bg-primary-950/20',
                    )}
                    onClick={() => navigate(ROUTES.EVENT_DETAIL(ev._id))}
                  >
                    <code className="text-xs font-mono text-surface-600 dark:text-surface-400 truncate">
                      {ev.type}
                    </code>
                    <div><StatusBadge value={ev.channel} /></div>
                    <div><StatusBadge value={ev.status} /></div>
                    <span className="text-2xs text-surface-400 text-right shrink-0 hidden sm:block">
                      {formatDateShort(ev.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Tenant info */}
            <div className="card overflow-hidden">
              <div
                className={cn(
                  'flex items-center gap-2 px-4 py-3 border-b',
                  'border-surface-100 dark:border-[#2a2d32]',
                )}
              >
                <Building2 className="w-3.5 h-3.5 text-surface-400" />
                <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                  Tenant
                </h2>
              </div>
              <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
                {tenantLoading ? (
                  <div className="p-4 space-y-2.5">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <Skeleton className="h-3.5 w-2/3" />
                  </div>
                ) : tenant ? (
                  <>
                    <InfoRow label="Name" value={tenant.name} />
                    <InfoRow label="Slug" value={tenant.slug} mono />
                    <InfoRow
                      label="Status"
                      value={<StatusBadge value={tenant.status} />}
                    />
                    <InfoRow
                      label="Your role"
                      value={<StatusBadge value={user?.role ?? ''} />}
                    />
                    <InfoRow
                      label="Created"
                      value={formatDateShort(tenant.createdAt)}
                    />
                  </>
                ) : (
                  <div className="px-4 py-4 text-xs text-surface-400">Unavailable</div>
                )}
              </div>
            </div>

            {/* System status */}
            <div className="card overflow-hidden">
              <div
                className={cn(
                  'flex items-center justify-between px-4 py-3 border-b',
                  'border-surface-100 dark:border-[#2a2d32]',
                )}
              >
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-surface-400" />
                  <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                    System Status
                  </h2>
                </div>
                <button
                  onClick={() => refetchKafka()}
                  title="Refresh Kafka status"
                  className="p-1 rounded hover:bg-surface-100 dark:hover:bg-[#2a2d32] text-surface-400 hover:text-surface-600 dark:hover:text-surface-300 transition-colors"
                >
                  <RefreshCw className={cn('w-3 h-3', kafkaLoading && 'animate-spin')} />
                </button>
              </div>
              <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
                <StatusRow label="API" status="operational" />
                <StatusRow
                  label="Authentication"
                  status={user ? 'operational' : 'degraded'}
                />
                <StatusRow
                  label="Kafka / Events"
                  status={kafkaRowStatus}
                  detail={
                    kafkaHealth?.kafka.latencyMs !== undefined
                      ? `${kafkaHealth.kafka.latencyMs}ms`
                      : undefined
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

type MetricAccent = 'amber' | 'green' | 'red' | 'neutral';

const ACCENT_ICON: Record<MetricAccent, string> = {
  amber: 'text-primary-600',
  green: 'text-success-600',
  red: 'text-error-600',
  neutral: 'text-surface-400',
};

function MetricWidget({
  label,
  value,
  icon,
  sub,
  isStatus,
  accent = 'neutral',
  onClick,
  clickable,
}: {
  label: string;
  value: string | number | null;
  icon: React.ReactNode;
  sub?: string;
  isStatus?: boolean;
  accent?: MetricAccent;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <div
      className={cn(
        'card p-4 relative overflow-hidden transition-colors',
        clickable && onClick && 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-700',
      )}
      onClick={onClick}
    >
      {/* Accent top border */}
      {accent === 'amber' && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary-600" />
      )}

      <div className="flex items-center justify-between mb-2.5">
        <span className="text-2xs font-medium text-surface-500 dark:text-surface-400 uppercase tracking-wide">
          {label}
        </span>
        <span className={ACCENT_ICON[accent]}>{icon}</span>
      </div>

      {value === null ? (
        <Skeleton className="h-7 w-14" />
      ) : isStatus ? (
        <div className="mt-1"><StatusBadge value={String(value)} /></div>
      ) : (
        <p className="text-2xl font-bold text-surface-900 dark:text-surface-100 tabular-nums leading-none">
          {value}
        </p>
      )}

      {sub && (
        <p className="text-2xs text-surface-400 dark:text-surface-500 mt-1.5">
          {sub}
        </p>
      )}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 text-xs">
      <span className="text-surface-500 dark:text-surface-400 shrink-0">{label}</span>
      <span
        className={cn(
          'text-surface-800 dark:text-surface-200 truncate text-right',
          mono && 'font-mono text-2xs',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function StatusRow({
  label,
  status,
  detail,
}: {
  label: string;
  status: 'operational' | 'degraded' | 'unknown';
  detail?: string;
}) {
  const dotClass =
    status === 'operational'
      ? 'bg-success-500'
      : status === 'degraded'
      ? 'bg-error-500'
      : 'bg-surface-300 dark:bg-surface-600';

  const textLabel =
    status === 'operational'
      ? 'Operational'
      : status === 'degraded'
      ? 'Unhealthy'
      : 'Checking…';

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-xs">
      <span className="text-surface-600 dark:text-surface-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={cn('status-dot', dotClass)} />
        <span className="text-surface-500 dark:text-surface-400">
          {textLabel}
          {detail && <span className="ml-1 text-surface-400 text-2xs">({detail})</span>}
        </span>
      </div>
    </div>
  );
}
