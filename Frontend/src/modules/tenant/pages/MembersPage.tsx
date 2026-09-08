import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Users, Search, X } from 'lucide-react';
import { useMembers } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, cn } from '@/lib/utils';
import { ROUTES } from '@/constants';
import type { Member } from '@/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function MembersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const limit = 20;
  const rawSearch = searchParams.get('search') ?? '';
  const [searchInput, setSearchInput] = useState(rawSearch);
  const debouncedSearch = useDebounce(searchInput, 350);

  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) next.set('search', debouncedSearch);
      else next.delete('search');
      next.set('page', '1');
      return next;
    }, { replace: true });
  }, [debouncedSearch, setSearchParams]);

  const { data, isLoading, isError, refetch, isFetching } = useMembers({
    page,
    limit,
    search: debouncedSearch,
  });

  const handlePageChange = (newPage: number) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(newPage));
      return next;
    });
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (m: Member) => (
        <span className="font-medium text-surface-900 dark:text-surface-100 text-xs">{m.name}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (m: Member) => (
        <span className="text-xs text-surface-500 dark:text-surface-400 font-mono">{m.email}</span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (m: Member) => <StatusBadge value={m.role} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (m: Member) => <ActiveBadge isActive={m.isActive} />,
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (m: Member) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">{formatDate(m.createdAt)}</span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (m: Member) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">{formatDate(m.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Members"
        description="Manage users in your organization"
        actions={
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="btn-secondary"
            aria-label="Refresh"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
        }
      />

      {/* ── Toolbar ─────────────────────────────────── */}
      <div className={cn(
        'flex items-center gap-2 px-5 py-2.5 border-b',
        'bg-surface-50 dark:bg-[#111214]',
        'border-surface-200 dark:border-[#2a2d32]',
      )}>
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-400 pointer-events-none" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or email…"
            className={cn(
              'pl-8 pr-8 py-1 text-xs rounded border w-60 transition-colors',
              'bg-white border-surface-200 text-surface-700 placeholder-surface-400',
              'focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600',
              'dark:bg-surface-900 dark:border-[#2a2d32] dark:text-surface-300',
            )}
            aria-label="Search members"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-700"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {isFetching && !isLoading && (
          <span className="text-2xs text-surface-400 dark:text-surface-500">Updating…</span>
        )}

        {data && !isLoading && (
          <span className="ml-auto text-2xs text-surface-400 dark:text-surface-500">
            {data.pagination.total.toLocaleString()} member{data.pagination.total !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Table ───────────────────────────────────── */}
      <div className="bg-white dark:bg-[#181a1d]">
        {isLoading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} message="Unable to load members. Try again." />
        ) : data?.members.length === 0 ? (
          <EmptyState
            icon={<Users className="w-8 h-8" />}
            title="No members found"
            description={debouncedSearch ? 'Try a different search term.' : 'Your organization has no members yet.'}
          />
        ) : (
          <DataTable
            columns={columns}
            data={data?.members ?? []}
            rowKey={(m) => m.id}
            onRowClick={(m) => navigate(ROUTES.MEMBER_DETAIL(m.id))}
          />
        )}
      </div>

      {/* ── Pagination ──────────────────────────────── */}
      {data && data.pagination.totalPages > 1 && (
        <div className={cn(
          'px-5 py-3 border-t',
          'bg-white dark:bg-[#181a1d]',
          'border-surface-200 dark:border-[#2a2d32]',
        )}>
          <Pagination pagination={data.pagination} onPageChange={handlePageChange} />
        </div>
      )}
    </div>
  );
}
