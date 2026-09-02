import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle } from 'lucide-react';
import { useTenant, useUpdateTenant } from '@/modules/tenant/hooks/useTenant';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage } from '@/lib/utils';

const generalSchema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(100),
  description: z.string().trim().max(500).optional().or(z.literal('')),
  website: z.union([
    z.string().trim().url('Must be a valid URL').max(2048),
    z.literal(''),
  ]).optional(),
});
type GeneralFormData = z.infer<typeof generalSchema>;

export function TenantSettingsPage() {
  const { data: tenant, isLoading, isError, refetch } = useTenant();
  const { mutateAsync: updateTenant } = useUpdateTenant();
  const toast = useToast();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<GeneralFormData>({
    resolver: zodResolver(generalSchema),
    values: tenant ? {
      name: tenant.name,
      description: tenant.description ?? '',
      website: tenant.website ?? '',
    } : undefined,
  });

  const onSubmit = async (data: GeneralFormData) => {
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined),
    ) as GeneralFormData;
    try {
      await updateTenant(payload);
      toast.success('Tenant settings saved');
      reset(data);
    } catch (err) {
      toast.error('Save failed', extractErrorMessage(err));
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Tenant Settings" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-full max-w-sm" />
        </div>
      </div>
    );
  }

  if (isError || !tenant) {
    return (
      <div>
        <PageHeader title="Tenant Settings" />
        <ErrorState onRetry={() => refetch()} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Tenant Settings"
        description="Manage your organization's configuration"
      />

      <div className="p-6 max-w-2xl space-y-6">
        {/* General section */}
        <section className="card">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <h2 className="font-medium text-sm text-surface-900 dark:text-surface-100">General</h2>
            <p className="text-xs text-surface-500 mt-0.5">Basic organization information</p>
          </div>
          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            <div>
              <label htmlFor="settings-name" className="label">Organization name</label>
              <input id="settings-name" type="text" className="input max-w-sm" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name.message}</p>}
            </div>

            <div>
              <label htmlFor="settings-slug" className="label">Slug</label>
              <input
                id="settings-slug"
                type="text"
                className="input max-w-sm bg-surface-50 dark:bg-surface-800 cursor-not-allowed opacity-60"
                value={tenant.slug}
                readOnly
                disabled
              />
              <p className="mt-1 text-xs text-surface-400">Slug is immutable and cannot be changed.</p>
            </div>

            <div>
              <label htmlFor="settings-desc" className="label">Description</label>
              <textarea id="settings-desc" rows={3} className="input resize-none" {...register('description')} />
            </div>

            <div>
              <label htmlFor="settings-website" className="label">Website</label>
              <input id="settings-website" type="url" placeholder="https://example.com" className="input max-w-sm" {...register('website')} />
              {errors.website && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.website.message}</p>}
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={isSubmitting || !isDirty} className="btn-primary">
                {isSubmitting
                  ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : null}
                Save changes
              </button>
              {isDirty && (
                <button type="button" onClick={() => reset()} className="btn-secondary">
                  Discard
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Status section */}
        <section className="card">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800">
            <h2 className="font-medium text-sm text-surface-900 dark:text-surface-100">Status</h2>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  Tenant Status
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  Current: <strong>{tenant.status}</strong>
                </p>
              </div>
              <span
                className={`px-2 py-1 rounded text-xs font-medium border ${
                  tenant.status === 'active'
                    ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800'
                    : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800'
                }`}
              >
                {tenant.status === 'active' ? 'Active' : 'Suspended'}
              </span>
            </div>
            <p className="mt-3 text-xs text-surface-400">
              Tenant status is managed by platform administrators. Contact support to change it.
            </p>
          </div>
        </section>

        {/* Danger zone */}
        <section className="card border-red-200 dark:border-red-800">
          <div className="px-5 py-4 border-b border-red-100 dark:border-red-900">
            <h2 className="font-medium text-sm text-red-700 dark:text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h2>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-surface-800 dark:text-surface-200">
                  Data retention warning
                </p>
                <p className="text-xs text-surface-500 mt-0.5">
                  Destructive actions require contacting support. No self-service tenant deletion is available.
                </p>
              </div>
              <button
                className="btn-danger shrink-0"
                onClick={() => setShowResetConfirm(true)}
              >
                Request deletion
              </button>
            </div>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="Request Tenant Deletion"
        description="This will initiate a deletion request for your tenant. All data will be permanently removed. This action cannot be undone. Please contact support to proceed."
        variant="danger"
        confirmLabel="I understand"
        onConfirm={() => {
          setShowResetConfirm(false);
          toast.info('Deletion request noted', 'Contact support@notifyhub.io to proceed.');
        }}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
