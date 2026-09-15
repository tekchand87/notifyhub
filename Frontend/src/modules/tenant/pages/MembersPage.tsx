import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { RefreshCw, Users, Search, X, UserPlus, Eye, EyeOff } from 'lucide-react';
import { useMembers, useAddMember } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, cn } from '@/lib/utils';
import { ROUTES } from '@/constants';
import type { Member, UserRole } from '@/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ── Add Member Modal ─────────────────────────────────────────────────────────
interface AddMemberModalProps {
  open: boolean;
  onClose: () => void;
}

function AddMemberModal({ open, onClose }: AddMemberModalProps) {
  const { mutate: addMember, isPending, error } = useAddMember();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'member' as UserRole });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim() || form.name.trim().length < 2) errs.name = 'Name must be at least 2 characters.';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Enter a valid email address.';
    if (!form.password || form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
    return errs;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setFieldErrors(errs); return; }
    setFieldErrors({});
    addMember(
      { name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role },
      {
        onSuccess: () => {
          setForm({ name: '', email: '', password: '', role: 'member' });
          onClose();
        },
      }
    );
  };

  if (!open) return null;

  const apiError = error as { response?: { data?: { message?: string } } } | null;
  const apiMessage = apiError?.response?.data?.message ?? (error ? 'Something went wrong. Please try again.' : null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={cn(
        'relative z-10 w-full max-w-md mx-4 rounded-xl shadow-2xl',
        'bg-white dark:bg-[#1c1e22]',
        'border border-surface-200 dark:border-[#2a2d32]',
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200 dark:border-[#2a2d32]">
          <div className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary-500" />
            <h2 className="text-sm font-semibold text-surface-900 dark:text-surface-100">Add Member</h2>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-5 py-4 space-y-4">

            {/* API error */}
            {apiMessage && (
              <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-400">
                {apiMessage}
              </div>
            )}

            {/* Name */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-700 dark:text-surface-300">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={set('name')}
                placeholder="Jane Doe"
                className={cn(
                  'w-full px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  'bg-white dark:bg-surface-900',
                  'text-surface-800 dark:text-surface-200',
                  'placeholder-surface-400',
                  'focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                  fieldErrors.name
                    ? 'border-red-400 dark:border-red-600'
                    : 'border-surface-200 dark:border-[#2a2d32]',
                )}
              />
              {fieldErrors.name && <p className="text-2xs text-red-500">{fieldErrors.name}</p>}
            </div>

            {/* Email */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-700 dark:text-surface-300">
                Work Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="jane@company.com"
                className={cn(
                  'w-full px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  'bg-white dark:bg-surface-900',
                  'text-surface-800 dark:text-surface-200',
                  'placeholder-surface-400',
                  'focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                  fieldErrors.email
                    ? 'border-red-400 dark:border-red-600'
                    : 'border-surface-200 dark:border-[#2a2d32]',
                )}
              />
              {fieldErrors.email && <p className="text-2xs text-red-500">{fieldErrors.email}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-700 dark:text-surface-300">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="Min. 8 characters"
                  className={cn(
                    'w-full pl-3 pr-9 py-1.5 text-xs rounded-lg border transition-colors',
                    'bg-white dark:bg-surface-900',
                    'text-surface-800 dark:text-surface-200',
                    'placeholder-surface-400',
                    'focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                    fieldErrors.password
                      ? 'border-red-400 dark:border-red-600'
                      : 'border-surface-200 dark:border-[#2a2d32]',
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {fieldErrors.password && <p className="text-2xs text-red-500">{fieldErrors.password}</p>}
            </div>

            {/* Role */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-surface-700 dark:text-surface-300">Role</label>
              <select
                value={form.role}
                onChange={set('role')}
                className={cn(
                  'w-full px-3 py-1.5 text-xs rounded-lg border transition-colors',
                  'bg-white dark:bg-surface-900',
                  'text-surface-800 dark:text-surface-200',
                  'border-surface-200 dark:border-[#2a2d32]',
                  'focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500',
                )}
              >
                <option value="member">Member</option>
                <option value="tenant_admin">Admin</option>
              </select>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-surface-200 dark:border-[#2a2d32]">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="btn-primary flex items-center gap-1.5"
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Member
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Members Page ─────────────────────────────────────────────────────────────
export function MembersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [modalOpen, setModalOpen] = useState(false);

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="btn-secondary"
              aria-label="Refresh"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} />
              Refresh
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="btn-primary flex items-center gap-1.5"
              aria-label="Add member"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add Member
            </button>
          </div>
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

      {/* ── Add Member Modal ─────────────────────────── */}
      <AddMemberModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
