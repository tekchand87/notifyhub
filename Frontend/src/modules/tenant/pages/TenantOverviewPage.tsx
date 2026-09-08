import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Edit2, X, Save } from 'lucide-react';
import { useTenant, useUpdateTenant } from '@/modules/tenant/hooks/useTenant';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/Toast';
import { formatDate, extractErrorMessage, cn } from '@/lib/utils';

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

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    useForm<UpdateFormData>({ resolver: zodResolver(updateSchema) });

  const startEdit = () => {
    if (!tenant) return;
    reset({ name: tenant.name, description: tenant.description, website: tenant.website });
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
        <div className="p-6 max-w-2xl space-y-2">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3.5 w-64" />
          <Skeleton className="h-3.5 w-36" />
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
          !editing ? (
            <button onClick={startEdit} className="btn-secondary">
              <Edit2 className="w-3.5 h-3.5" />
              Edit
            </button>
          ) : undefined
        }
      />

      <div className="p-6 max-w-2xl">
        {/* ── Read mode ───────────────────────────────── */}
        {!editing ? (
          <div className="card overflow-hidden">
            <div className={cn(
              'flex items-center gap-2 px-4 py-3 border-b',
              'border-surface-100 dark:border-[#2a2d32]',
            )}>
              <Building2 className="w-3.5 h-3.5 text-surface-400" />
              <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                Organization Details
              </h2>
            </div>
            <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
              <DetailRow label="Name" value={
                <span className="font-medium text-surface-900 dark:text-surface-100">{tenant.name}</span>
              } />
              <DetailRow label="Slug" value={
                <code className="font-mono text-2xs bg-surface-100 dark:bg-surface-800 text-surface-700 dark:text-surface-300 px-1.5 py-0.5 rounded">
                  {tenant.slug}
                </code>
              } />
              <DetailRow label="Status" value={<StatusBadge value={tenant.status} />} />
              <DetailRow
                label="Description"
                value={tenant.description
                  ? <span className="text-surface-700 dark:text-surface-300">{tenant.description}</span>
                  : <span className="text-surface-400">—</span>}
              />
              <DetailRow
                label="Website"
                value={tenant.website
                  ? <a href={tenant.website} target="_blank" rel="noopener noreferrer" className="link text-xs">{tenant.website}</a>
                  : <span className="text-surface-400">—</span>}
              />
              <DetailRow label="Created" value={
                <span className="font-mono text-2xs text-surface-500">{formatDate(tenant.createdAt)}</span>
              } />
              <DetailRow label="Updated" value={
                <span className="font-mono text-2xs text-surface-500">{formatDate(tenant.updatedAt)}</span>
              } />
            </div>
          </div>
        ) : (
          /* ── Edit mode ────────────────────────────── */
          <div className="card overflow-hidden">
            <div className={cn(
              'flex items-center gap-2 px-4 py-3 border-b',
              'border-surface-100 dark:border-[#2a2d32]',
            )}>
              <Edit2 className="w-3.5 h-3.5 text-primary-600" />
              <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                Edit Organization
              </h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
              <div className="field">
                <label htmlFor="tenant-name" className="label">Name</label>
                <input id="tenant-name" type="text" className="input max-w-sm" {...register('name')} />
                {errors.name && <p className="field-error">{errors.name.message}</p>}
              </div>

              <div className="field">
                <label htmlFor="tenant-desc" className="label">Description</label>
                <textarea id="tenant-desc" rows={3} className="input resize-none" {...register('description')} />
              </div>

              <div className="field">
                <label htmlFor="tenant-website" className="label">Website</label>
                <input id="tenant-website" type="url" className="input max-w-sm" placeholder="https://example.com" {...register('website')} />
                {errors.website && <p className="field-error">{errors.website.message}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting
                    ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Save className="w-3.5 h-3.5" />}
                  Save changes
                </button>
                <button type="button" onClick={() => setEditing(false)} className="btn-secondary">
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 px-4 py-2.5 text-xs">
      <span className="w-28 shrink-0 text-surface-500 dark:text-surface-400 pt-0.5">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
