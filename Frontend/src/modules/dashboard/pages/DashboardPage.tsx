import { useNavigate } from 'react-router-dom';
import { Bell, Users, Building2, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { useTenant } from '@/modules/tenant/hooks/useTenant';
import { useEvents } from '@/modules/events/hooks/useEvents';
import { useMembers } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatDate, formatDateShort } from '@/lib/utils';
import { ROUTES } from '@/constants';

export function DashboardPage() {
  const { user } = useAuth();
  const { data: tenant, isLoading: tenantLoading } = useTenant();
  const { data: eventsData, isLoading: eventsLoading } = useEvents({ limit: 10 });
  const { data: membersData, isLoading: membersLoading } = useMembers({ limit: 1 });
  const navigate = useNavigate();

  const isAdmin = user?.role === 'tenant_admin';

  // Derive event counts from the recent list (approximate, not a dedicated endpoint)
  const events = eventsData?.events ?? [];
  const totalEvents = eventsData?.pagination.total ?? 0;
  const deliveredCount = events.filter((e) => e.status === 'delivered').length;
  const failedCount = events.filter((e) => e.status === 'failed' || e.status === 'dlq').length;
  const queuedCount = events.filter((e) => e.status === 'queued' || e.status === 'processing').length;
  const totalMembers = membersData?.pagination.total ?? 0;

  return (
    <div className="p-0">
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user?.name ?? '—'}`}
      />

      <div className="p-6 space-y-6">
        {/* Metric widgets */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          <MetricCard
            label="Total Events"
            value={eventsLoading ? null : totalEvents}
            icon={<Bell className="w-4 h-4 text-primary-500" />}
            onClick={() => navigate(ROUTES.EVENTS)}
          />
          <MetricCard
            label="Delivered"
            value={eventsLoading ? null : deliveredCount}
            icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
            sub="in last 10"
          />
          <MetricCard
            label="Failed / DLQ"
            value={eventsLoading ? null : failedCount}
            icon={<XCircle className="w-4 h-4 text-red-500" />}
            sub="in last 10"
          />
          <MetricCard
            label="Queued"
            value={eventsLoading ? null : queuedCount}
            icon={<Clock className="w-4 h-4 text-yellow-500" />}
            sub="in last 10"
          />
          {isAdmin && (
            <MetricCard
              label="Members"
              value={membersLoading ? null : totalMembers}
              icon={<Users className="w-4 h-4 text-indigo-500" />}
              onClick={() => navigate(ROUTES.MEMBERS)}
            />
          )}
          <MetricCard
            label="Tenant Status"
            value={tenantLoading ? null : (tenant?.status ?? '—')}
            icon={<Building2 className="w-4 h-4 text-surface-400" />}
            isStatus
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Recent Events */}
          <div className="lg:col-span-2 card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-800">
              <h2 className="font-medium text-sm text-surface-800 dark:text-surface-200">Recent Events</h2>
              <button
                onClick={() => navigate(ROUTES.EVENTS)}
                className="text-xs link"
              >
                View all
              </button>
            </div>
            {eventsLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-surface-400">
                No events yet
              </div>
            ) : (
              <div className="divide-y divide-surface-100 dark:divide-surface-800">
                {events.slice(0, 8).map((ev) => (
                  <div
                    key={ev._id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/60 cursor-pointer text-sm"
                    onClick={() => navigate(ROUTES.EVENT_DETAIL(ev._id))}
                  >
                    <StatusBadge value={ev.status} />
                    <span className="flex-1 truncate font-mono text-xs text-surface-600 dark:text-surface-400">
                      {ev.type}
                    </span>
                    <StatusBadge value={ev.channel} />
                    <span className="text-xs text-surface-400 shrink-0 hidden sm:block">
                      {formatDateShort(ev.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tenant info + system status */}
          <div className="space-y-4">
            {/* Tenant info */}
            <div className="card">
              <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
                <h2 className="font-medium text-sm text-surface-800 dark:text-surface-200">Tenant</h2>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                {tenantLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                ) : tenant ? (
                  <>
                    <InfoRow label="Name" value={tenant.name} />
                    <InfoRow label="Slug" value={tenant.slug} mono />
                    <InfoRow
                      label="Status"
                      value={<StatusBadge value={tenant.status} />}
                    />
                    <InfoRow label="Your role" value={<StatusBadge value={user?.role ?? ''} />} />
                    <InfoRow label="Created" value={formatDateShort(tenant.createdAt)} />
                  </>
                ) : (
                  <p className="text-surface-400">Unavailable</p>
                )}
              </div>
            </div>

            {/* System status */}
            <div className="card">
              <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
                <h2 className="font-medium text-sm text-surface-800 dark:text-surface-200">System Status</h2>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <StatusRow label="API" status="operational" />
                <StatusRow label="Authentication" status={user ? 'operational' : 'degraded'} />
                <StatusRow label="Kafka / Events" status="unknown" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  sub,
  isStatus,
  onClick,
}: {
  label: string;
  value: string | number | null;
  icon: React.ReactNode;
  sub?: string;
  isStatus?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`card p-4 ${onClick ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-700 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-surface-500 dark:text-surface-400">{label}</span>
        {icon}
      </div>
      {value === null ? (
        <Skeleton className="h-6 w-16" />
      ) : isStatus ? (
        <StatusBadge value={String(value)} />
      ) : (
        <p className="text-xl font-semibold text-surface-900 dark:text-surface-100">
          {value}
        </p>
      )}
      {sub && <p className="text-2xs text-surface-400 mt-0.5">{sub}</p>}
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
    <div className="flex items-center justify-between gap-2">
      <span className="text-surface-500 dark:text-surface-400 shrink-0">{label}</span>
      <span className={`text-surface-800 dark:text-surface-200 truncate text-right ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function StatusRow({ label, status }: { label: string; status: 'operational' | 'degraded' | 'unknown' }) {
  const dot =
    status === 'operational'
      ? 'bg-green-400'
      : status === 'degraded'
      ? 'bg-yellow-400'
      : 'bg-surface-300 dark:bg-surface-600';
  const text =
    status === 'operational'
      ? 'Operational'
      : status === 'degraded'
      ? 'Degraded'
      : 'Unknown';

  return (
    <div className="flex items-center justify-between">
      <span className="text-surface-600 dark:text-surface-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-surface-600 dark:text-surface-400 text-xs">{text}</span>
      </div>
    </div>
  );
}
