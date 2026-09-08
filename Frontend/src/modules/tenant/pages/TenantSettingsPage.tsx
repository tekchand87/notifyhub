import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, Settings, Lock, ShieldOff } from 'lucide-react';
import { useTenant, useUpdateTenant } from '@/modules/tenant/hooks/useTenant';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { extractErrorMessage, cn } from '@/lib/utils';

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

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty }, reset } =
    useForm<GeneralFormData>({
      resolver: zodResolver(generalSchema),
      values: tenant ? {
        name: tenant.name,
        description: tenant.description ?? '',
        website: tenant.website ?? '',
      } : undefined,
    });

  const onSubmit = async (data: GeneralFormData) => {
    const payload = Object.fromEntries(
      Object.entries(data).filter(([, v]) => v !== undefined && v !== ''),
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
        <div className="p-6 max-w-2xl space-y-3">
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-8 w-full max-w-sm" />
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

      <div className="p-6 max-w-2xl space-y-5">
        {/* ── General ───────────────────────────────── */}
        <section className="card overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 px-5 py-3.5 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Settings className="w-3.5 h-3.5 text-surface-400" />
            <div>
              <h2 className="text-xs font-semibold text-surface-900 dark:text-surface-100 uppercase tracking-wide">
                General
              </h2>
              <p className="text-2xs text-surface-400 mt-0.5">Basic organization information</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
            <div className="field">
              <label htmlFor="settings-name" className="label">Organization name</label>
              <input id="settings-name" type="text" className="input max-w-sm" {...register('name')} />
              {errors.name && <p className="field-error">{errors.name.message}</p>}
            </div>

            <div className="field">
              <label htmlFor="settings-slug" className="label">Slug</label>
              <input
                id="settings-slug"
                type="text"
                className="input max-w-sm opacity-50 cursor-not-allowed"
                value={tenant.slug}
                readOnly
                disabled
              />
              <p className="text-2xs text-surface-400 mt-1">Slug is immutable and cannot be changed.</p>
            </div>

            <div className="field">
              <label htmlFor="settings-desc" className="label">Description</label>
              <textarea id="settings-desc" rows={3} className="input resize-none" {...register('description')} />
            </div>

            <div className="field">
              <label htmlFor="settings-website" className="label">Website</label>
              <input
                id="settings-website"
                type="url"
                placeholder="https://example.com"
                className="input max-w-sm"
                {...register('website')}
              />
              {errors.website && <p className="field-error">{errors.website.message}</p>}
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={isSubmitting || !isDirty} className="btn-primary">
                {isSubmitting
                  ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
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

        {/* ── Status ────────────────────────────────── */}
        <section className="card overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 px-5 py-3.5 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Lock className="w-3.5 h-3.5 text-surface-400" />
            <h2 className="text-xs font-semibold text-surface-900 dark:text-surface-100 uppercase tracking-wide">
              Status
            </h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-surface-800 dark:text-surface-200">
                Tenant Status
              </p>
              <p className="text-2xs text-surface-400 mt-0.5">
                Managed by platform administrators. Contact support to change.
              </p>
            </div>
            <StatusBadge value={tenant.status} />
          </div>
        </section>

        {/* ── Danger Zone ───────────────────────────── */}
        <section className={cn(
          'card overflow-hidden',
          'border-red-200 dark:border-red-900',
        )}>
          <div className={cn(
            'flex items-center gap-2 px-5 py-3.5 border-b',
            'border-red-100 dark:border-red-900',
            'bg-red-50/50 dark:bg-red-950/20',
          )}>
            <ShieldOff className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
            <h2 className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wide">
              Danger Zone
            </h2>
          </div>
          <div className="px-5 py-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium text-surface-800 dark:text-surface-200">
                Data retention warning
              </p>
              <p className="text-2xs text-surface-500 mt-0.5 max-w-sm">
                Destructive actions require contacting support. No self-service tenant deletion is available.
              </p>
            </div>
            <button
              className="btn-danger shrink-0"
              onClick={() => setShowResetConfirm(true)}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              Request deletion
            </button>
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
