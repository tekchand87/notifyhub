import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Key, Copy, Check, AlertTriangle, Eye, EyeOff, X } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/modules/apiKeys/hooks/useApiKeys';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ActiveBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { formatDate, extractErrorMessage, cn } from '@/lib/utils';
import { API_KEY_SCOPES } from '@/constants';
import type { ApiKey } from '@/types';

const createSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100),
  scopes: z.array(z.string()),
});
type CreateFormData = z.infer<typeof createSchema>;

export function ApiKeysPage() {
  const { data: keys, isLoading, isError, refetch } = useApiKeys();
  const { mutateAsync: createKey, isPending: creating } = useCreateApiKey();
  const { mutateAsync: revokeKey } = useRevokeApiKey();
  const toast = useToast();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [keyVisible, setKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateFormData>({
    resolver: zodResolver(createSchema) as never,
    defaultValues: { name: '', scopes: [] as string[] },
  });

  const onCreateSubmit = async (data: CreateFormData) => {
    try {
      const result = await createKey({ name: data.name, scopes: data.scopes });
      setNewRawKey(result.rawApiKey);
      reset();
      setShowCreateForm(false);
      toast.success('API key created — copy it now, it won\'t be shown again');
    } catch (err) {
      toast.error('Create failed', extractErrorMessage(err));
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await revokeKey(revokeTarget);
      toast.success('API key revoked');
    } catch (err) {
      toast.error('Revoke failed', extractErrorMessage(err));
    }
    setRevokeTarget(null);
  };

  const copyKey = () => {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (k: ApiKey) => (
        <span className="font-medium text-xs text-surface-900 dark:text-surface-100">{k.name}</span>
      ),
    },
    {
      key: 'prefix',
      header: 'Key Prefix',
      render: (k: ApiKey) => (
        <code className="text-2xs font-mono text-surface-500 dark:text-surface-400">
          {k.keyPrefix}…
        </code>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      render: (k: ApiKey) => (
        <span className="text-2xs text-surface-500 dark:text-surface-400">
          {k.scopes.join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (k: ApiKey) => <ActiveBadge isActive={k.isActive} />,
    },
    {
      key: 'expires',
      header: 'Expires',
      render: (k: ApiKey) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">
          {k.expiresAt ? formatDate(k.expiresAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (k: ApiKey) => (
        <span className="text-2xs text-surface-400 dark:text-surface-500 font-mono">
          {formatDate(k.createdAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right' as const,
      render: (k: ApiKey) =>
        k.isActive ? (
          <button
            onClick={(e) => { e.stopPropagation(); setRevokeTarget(k.id); }}
            className="btn-danger py-1 text-2xs"
          >
            Revoke
          </button>
        ) : (
          <span className="text-2xs text-surface-400 dark:text-surface-500">Revoked</span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Manage API keys for external event publishing"
        actions={
          <button onClick={() => setShowCreateForm(true)} className="btn-primary">
            <Plus className="w-3.5 h-3.5" />
            Create API Key
          </button>
        }
      />

      {/* ── New key revealed banner ──────────────────── */}
      {newRawKey && (
        <div className={cn(
          'mx-6 mt-4 rounded border p-4',
          'bg-warning-50 border-warning-300',
          'dark:bg-warning-950 dark:border-warning-800',
        )}>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-warning-600 dark:text-warning-400 shrink-0" />
            <p className="text-xs font-semibold text-warning-800 dark:text-warning-200">
              Copy your API key now — it will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              'flex-1 font-mono text-2xs rounded border px-3 py-2 overflow-x-auto',
              'bg-white dark:bg-[#111214]',
              'border-warning-200 dark:border-warning-800',
              'text-surface-700 dark:text-surface-300',
            )}>
              {keyVisible ? newRawKey : '•'.repeat(48)}
            </div>
            <button
              onClick={() => setKeyVisible((v) => !v)}
              className="btn-secondary"
              aria-label={keyVisible ? 'Hide key' : 'Show key'}
            >
              {keyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
            <button onClick={copyKey} className="btn-primary">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              onClick={() => setNewRawKey(null)}
              className="btn-ghost"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Create form ──────────────────────────────── */}
      {showCreateForm && (
        <div className={cn(
          'mx-6 mt-4 card overflow-hidden max-w-lg',
        )}>
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Key className="w-3.5 h-3.5 text-primary-600" />
            <h3 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
              New API Key
            </h3>
          </div>

          <form onSubmit={handleSubmit(onCreateSubmit as never)} className="p-5 space-y-4">
            <div className="field">
              <label htmlFor="key-name" className="label">Key name</label>
              <input
                id="key-name"
                type="text"
                className="input"
                placeholder="My integration"
                {...register('name')}
              />
              {errors.name && <p className="field-error">{errors.name.message}</p>}
            </div>

            <div className="field">
              <p className="label">Scopes</p>
              <div className="space-y-2 mt-1">
                {API_KEY_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className="flex items-center gap-2.5 text-xs cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      value={scope}
                      {...register('scopes')}
                      className="rounded border-surface-300 text-primary-600 focus:ring-primary-600 dark:border-surface-600"
                    />
                    <code className={cn(
                      'text-2xs font-mono px-1.5 py-0.5 rounded',
                      'bg-surface-100 dark:bg-surface-800',
                      'text-surface-700 dark:text-surface-300',
                    )}>
                      {scope}
                    </code>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Plus className="w-3.5 h-3.5" />}
                Create
              </button>
              <button
                type="button"
                onClick={() => { setShowCreateForm(false); reset(); }}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Table ───────────────────────────────────── */}
      <div className={cn('mt-4 bg-white dark:bg-[#181a1d]')}>
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !keys || keys.length === 0 ? (
          <EmptyState
            icon={<Key className="w-8 h-8" />}
            title="No API keys"
            description="Create an API key to allow external applications to publish events."
            action={
              <button onClick={() => setShowCreateForm(true)} className="btn-primary">
                <Plus className="w-3.5 h-3.5" />
                Create API Key
              </button>
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={keys}
            rowKey={(k) => k.id}
          />
        )}
      </div>

      <ConfirmDialog
        open={!!revokeTarget}
        title="Revoke API Key"
        description="This API key will be permanently disabled. Any integrations using it will stop working immediately."
        variant="danger"
        confirmLabel="Revoke Key"
        onConfirm={handleRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
