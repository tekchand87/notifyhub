import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Key, Copy, Check, RotateCcw, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from '@/modules/apiKeys/hooks/useApiKeys';
import { PageHeader } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/ui/DataTable';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { EmptyState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ActiveBadge } from '@/components/ui/StatusBadge';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/utils';
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
        <span className="font-medium text-surface-900 dark:text-surface-100">{k.name}</span>
      ),
    },
    {
      key: 'prefix',
      header: 'Prefix',
      render: (k: ApiKey) => (
        <code className="text-xs font-mono text-surface-500">{k.keyPrefix}…</code>
      ),
    },
    {
      key: 'scopes',
      header: 'Scopes',
      render: (k: ApiKey) => (
        <span className="text-xs text-surface-500">{k.scopes.join(', ') || '—'}</span>
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
        <span className="text-xs text-surface-500">
          {k.expiresAt ? formatDate(k.expiresAt) : 'Never'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (k: ApiKey) => (
        <span className="text-xs text-surface-500">{formatDate(k.createdAt)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (k: ApiKey) =>
        k.isActive ? (
          <button
            onClick={(e) => { e.stopPropagation(); setRevokeTarget(k.id); }}
            className="btn-danger text-xs py-1"
          >
            Revoke
          </button>
        ) : (
          <span className="text-xs text-surface-400">Revoked</span>
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

      {/* New key revealed */}
      {newRawKey && (
        <div className="mx-6 mt-4 p-4 rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 dark:border-yellow-800">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              Copy your API key now — it will not be shown again.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 font-mono text-xs bg-white dark:bg-surface-900 border border-yellow-200 dark:border-yellow-700 rounded px-3 py-2 overflow-x-auto">
              {keyVisible ? newRawKey : '•'.repeat(40)}
            </div>
            <button
              onClick={() => setKeyVisible((v) => !v)}
              className="btn-secondary"
              aria-label={keyVisible ? 'Hide key' : 'Show key'}
            >
              {keyVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button onClick={copyKey} className="btn-primary">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button onClick={() => setNewRawKey(null)} className="btn-ghost text-xs">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="mx-6 mt-4 card p-5 max-w-lg">
          <h3 className="font-medium text-sm mb-4 text-surface-800 dark:text-surface-200">Create API Key</h3>
          <form onSubmit={handleSubmit(onCreateSubmit as never)} className="space-y-4">
            <div>
              <label htmlFor="key-name" className="label">Key name</label>
              <input id="key-name" type="text" className="input" placeholder="My integration" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label className="label">Scopes</label>
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" value={scope} {...register('scopes')} className="rounded" />
                  <code className="text-xs">{scope}</code>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="btn-primary">
                {creating ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                Create
              </button>
              <button type="button" onClick={() => { setShowCreateForm(false); reset(); }} className="btn-secondary">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="mt-4 bg-white dark:bg-surface-900">
        {isLoading ? (
          <TableSkeleton rows={5} cols={7} />
        ) : isError ? (
          <ErrorState onRetry={() => refetch()} />
        ) : !keys || keys.length === 0 ? (
          <EmptyState
            icon={<Key className="w-10 h-10" />}
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
