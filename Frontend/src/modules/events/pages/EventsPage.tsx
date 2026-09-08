import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Bell, SlidersHorizontal, X } from 'lucide-react';
import { useEvents } from '@/modules/events/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, truncate, cn } from '@/lib/utils';
import { ROUTES } from '@/constants';
import type { Event, EventStatus, EventChannel } from '@/types';

export function EventsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const status = (searchParams.get('status') ?? '') as EventStatus | '';
  const channel = (searchParams.get('channel') ?? '') as EventChannel | '';

  const { data, isLoading, isError, refetch, isFetching } = useEvents({
    page,
    limit: 25,
    status: status || undefined,
    channel: channel || undefined,
  });

  const setFilter = (key: string, value: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  };

  const clearFilters = () => setSearchParams({ page: '1' });
  const hasFilters = Boolean(status || channel);

  const columns = [
    {
      key: 'id',
      header: 'Event ID',
      width: '160px',
      render: (e: Event) => (
        <code className="text-2xs font-mono text-surface-400 dark:text-surface-500">
          {truncate(e._id, 16)}
        </code>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (e: Event) => (
        <code className="text-xs font-mono text-surface-700 dark:text-surface-300">
          {e.type}
        </code>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      width: '100px',
      render: (e: Event) => <StatusBadge value={e.channel} />,
    },
    {
      key: 'status',
      header: 'Status',
      width: '110px',
      render: (e: Event) => <StatusBadge value={e.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      width: '150px',
      render: (e: Event) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">
          {formatDate(e.createdAt)}
        </span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      width: '150px',
      render: (e: Event) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">
          {formatDate(e.updatedAt)}
        </span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Events"
        description="Notification events published to your tenant"
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
            aria-label="Refresh events"
          >
            <RefreshCw
              className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')}
            />
            Refresh
          </button>
        }
      />

      {/* ── Filter bar ──────────────────────────────────── */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 px-5 py-2.5 border-b',
          'bg-surface-50 dark:bg-[#111214]',
          'border-surface-200 dark:border-[#2a2d32]',
        )}
      >
        <div className="flex items-center gap-1.5 text-2xs text-surface-400 dark:text-surface-500 mr-1">
          <SlidersHorizontal className="w-3 h-3" />
          <span className="font-medium uppercase tracking-wide">Filter</span>
        </div>

        {/* Status filter */}
        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className={cn(
            'text-xs rounded border px-2 py-1 transition-colors',
            'bg-white border-surface-200 text-surface-700',
            'focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600',
            'dark:bg-surface-900 dark:border-[#2a2d32] dark:text-surface-300',
            status && 'border-primary-400 text-primary-700 dark:border-primary-700 dark:text-primary-400',
          )}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="dlq">DLQ</option>
        </select>

        {/* Channel filter */}
        <select
          value={channel}
          onChange={(e) => setFilter('channel', e.target.value)}
          className={cn(
            'text-xs rounded border px-2 py-1 transition-colors',
            'bg-white border-surface-200 text-surface-700',
            'focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600',
            'dark:bg-surface-900 dark:border-[#2a2d32] dark:text-surface-300',
            channel && 'border-primary-400 text-primary-700 dark:border-primary-700 dark:text-primary-400',
          )}
          aria-label="Filter by channel"
        >
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="webhook">Webhook</option>
        </select>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-2xs transition-colors',
              'text-surface-500 hover:text-surface-800 hover:bg-surface-100',
              'dark:text-surface-500 dark:hover:text-surface-300 dark:hover:bg-surface-800',
            )}
          >
            <X className="w-3 h-3" />
            Clear
          </button>
        )}

        {/* Fetching indicator */}
        {isFetching && !isLoading && (
          <span className="text-2xs text-surface-400 dark:text-surface-500 ml-1">
            Updating…
          </span>
        )}

        {/* Result count */}
        {data && !isLoading && (
          <span className="ml-auto text-2xs text-surface-400 dark:text-surface-500">
            {data.pagination.total.toLocaleString()} event
            {data.pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#181a1d]">
        {isLoading ? (
          <TableSkeleton rows={12} cols={6} />
        ) : isError ? (
          <ErrorState
            onRetry={() => refetch()}
            message="Unable to load events. Check your connection and try again."
          />
        ) : data?.events.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-8 h-8" />}
            title="No events found"
            description={
              hasFilters
                ? 'No events match the current filters. Try adjusting or clearing them.'
                : 'No events have been published to this tenant yet.'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={data?.events ?? []}
            rowKey={(e) => e._id}
            onRowClick={(e) => navigate(ROUTES.EVENT_DETAIL(e._id))}
          />
        )}
      </div>

      {/* ── Pagination ──────────────────────────────────── */}
      {data && data.pagination.totalPages > 1 && (
        <div
          className={cn(
            'px-5 py-3 border-t',
            'bg-white dark:bg-[#181a1d]',
            'border-surface-200 dark:border-[#2a2d32]',
          )}
        >
          <Pagination
            pagination={data.pagination}
            onPageChange={(p) =>
              setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                next.set('page', String(p));
                return next;
              })
            }
          />
        </div>
      )}
    </div>
  );
}
