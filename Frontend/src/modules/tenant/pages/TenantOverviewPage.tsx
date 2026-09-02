import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { RefreshCw } from 'lucide-react';
import { useTenant, useUpdateTenant } from '@/modules/tenant/hooks/useTenant';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/utils';

const updateSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100).optional().or(z.literal('')),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  website: z.string().trim().url('Must be a valid URL').max(2048).optional().or(z.literal('')),
});
type UpdateFormData = z.infer<typeof updateSchema>;

export function TenantOverviewPage() {
  const { data: tenant, isLoading, isError, refetch } = useTenant();
  const { mutateAsync: updateTenant } = useUpdateTenant();
  const toast = useToast();
  const [editing, setEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFormData>({ resolver: zodResolver(updateSchema) });

  const startEdit = () => {
    if (!tenant) return;
    reset({
      name: tenant.name,
      description: tenant.description,
      website: tenant.website,
    });
    setEditing(true);
  };

  const onSubmit = async (data: UpdateFormData) => {
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== '' && v !== undefined),
    ) as UpdateFormData;
    try {
      await updateTenant(payload);
      toast.success('Tenant updated successfully');
      setEditing(false);
    } catch (err) {
      toast.error('Update failed', extractErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Tenant Overview" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-36" />
        </div>
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div>
        <PageHeader title="Tenant Overview" />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tenant Overview"
        description="Your organization's workspace"
        actions={
          !editing && (
            <button onClick={startEdit} className="btn-primary">
              Edit
            </button>
          )
        }
      />

      <div className="p-6 max-w-2xl">
        {!editing ? (
          <div className="card divide-y divide-surface-100 dark:divide-surface-800">
            <DetailRow label="Name" value={tenant.name} />
            <DetailRow label="Slug" value={<code className="font-mono text-xs bg-surface-100 dark:bg-surface-800 px-1 py-0.5 rounded">{tenant.slug}</code>} />
            <DetailRow label="Status" value={<StatusBadge value={tenant.status} />} />
            <DetailRow label="Description" value={tenant.description || <span className="text-surface-400">—</span>} />
            <DetailRow label="Website" value={tenant.website
              ? <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="link">{tenant.website}</a>
              : <span className="text-surface-400">—</span>}
            />
            <DetailRow label="Created" value={formatDate(tenant.createdAt)} />
            <DetailRow label="Updated" value={formatDate(tenant.updatedAt)} />
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="card p-5 space-y-4">
            <div>
              <label htmlFor="tenant-name" className="label">Name</label>
              <input id="tenant-name" type="text" className="input" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="tenant-desc" className="label">Description</label>
              <textarea id="tenant-desc" rows={3} className="input resize-none" {...register('description')} />
            </div>
            <div>
              <label htmlFor="tenant-website" className="label">Website</label>
              <input id="tenant-website" type="url" className="input" placeholder="https://example.com" {...register('website')} />
              {errors.website && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.website.message}</p>}
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSubmitting} className="btn-primary">
                {isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                Save changes
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-3 text-sm">
      <span className="w-32 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
