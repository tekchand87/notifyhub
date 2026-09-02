import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Bell } from 'lucide-react';
import { useEvents } from '@/modules/events/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, truncate } from '@/lib/utils';
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
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

  const columns = [
    {
      key: 'id',
      header: 'Event ID',
      render: (e: Event) => (
        <code className="text-xs font-mono text-surface-500 dark:text-surface-400">
          {truncate(e._id, 16)}
        </code>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (e: Event) => (
        <code className="text-xs font-mono text-surface-700 dark:text-surface-300">{e.type}</code>
      ),
    },
    {
      key: 'channel',
      header: 'Channel',
      render: (e: Event) => <StatusBadge value={e.channel} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (e: Event) => <StatusBadge value={e.status} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (e: Event) => (
        <span className="text-surface-500 dark:text-surface-400 text-xs">{formatDate(e.createdAt)}</span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (e: Event) => (
        <span className="text-surface-500 dark:text-surface-400 text-xs">{formatDate(e.updatedAt)}</span>
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
            aria-label="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <span className="text-xs text-surface-500 mr-1">Filter:</span>

        <select
          value={status}
          onChange={(e) => setFilter('status', e.target.value)}
          className="input w-36 text-xs"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="processing">Processing</option>
          <option value="delivered">Delivered</option>
          <option value="failed">Failed</option>
          <option value="dlq">DLQ</option>
        </select>

        <select
          value={channel}
          onChange={(e) => setFilter('channel', e.target.value)}
          className="input w-32 text-xs"
          aria-label="Filter by channel"
        >
          <option value="">All channels</option>
          <option value="email">Email</option>
          <option value="webhook">Webhook</option>
        </select>

        {(status || channel) && (
          <button
            onClick={() => {
              setSearchParams({ page: '1' });
            }}
            className="btn-ghost text-xs"
          >
            Clear filters
          </button>
        )}

        {isFetching && !isLoading && (
          <span className="text-xs text-surface-400">Updating…</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-surface-900">
        {isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} message="Unable to load events. Try again." />
        ) : data?.events.length === 0 ? (
          <EmptyState
            icon={<Bell className="w-10 h-10" />}
            title="No events found"
            description={status || channel ? 'Try adjusting your filters.' : 'No events have been published yet.'}
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

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="px-6 py-3 border-t border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
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
