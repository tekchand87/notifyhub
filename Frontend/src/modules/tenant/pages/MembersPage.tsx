import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Users } from 'lucide-react';
import { useMembers } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { SearchBar } from '@/components/ui/SearchBar';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate } from '@/lib/utils';
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

  // Sync debounced search to URL
  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (debouncedSearch) {
        next.set('search', debouncedSearch);
      } else {
        next.delete('search');
      }
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
        <span className="font-medium text-surface-900 dark:text-surface-100">{m.name}</span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (m: Member) => (
        <span className="text-surface-600 dark:text-surface-400">{m.email}</span>
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
        <span className="text-surface-500 dark:text-surface-400">{formatDate(m.createdAt)}</span>
      ),
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      render: (m: Member) => (
        <span className="text-surface-500 dark:text-surface-400">{formatDate(m.updatedAt)}</span>
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
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
        <SearchBar
          value={searchInput}
          onChange={setSearchInput}
          placeholder="Search by name or email…"
          className="w-64"
        />
        {isFetching && !isLoading && (
          <span className="text-xs text-surface-400">Updating…</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-surface-900">
        {isLoading ? (
          <TableSkeleton rows={8} cols={6} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} message="Unable to load members. Try again." />
        ) : data?.members.length === 0 ? (
          <EmptyState
            icon={<Users className="w-10 h-10" />}
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

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="px-6 py-3 border-t border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900">
          <Pagination pagination={data.pagination} onPageChange={handlePageChange} />
        </div>
      )}
    </div>
  );
}
