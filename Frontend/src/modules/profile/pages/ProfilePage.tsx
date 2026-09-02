import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { User, Key } from 'lucide-react';
import { useAuth } from '@/modules/auth/AuthContext';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { authApi } from '@/api/auth.api';
import { changePasswordSchema, type ChangePasswordFormData } from '@/modules/auth/schemas';
import { extractErrorMessage, formatDate } from '@/lib/utils';

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const [showPwdForm, setShowPwdForm] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormData>({ resolver: zodResolver(changePasswordSchema) });

  const onPasswordSubmit = async (data: ChangePasswordFormData) => {
    try {
      await authApi.changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      toast.success('Password changed successfully');
      reset();
      setShowPwdForm(false);
    } catch (err) {
      toast.error('Password change failed', extractErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader title="Profile" description="Your account information" />

      <div className="p-6 max-w-2xl space-y-6">
        {/* Profile info */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-surface-900 dark:text-surface-100">{user?.name}</p>
              <p className="text-xs text-surface-500">{user?.email}</p>
            </div>
          </div>

          <div className="divide-y divide-surface-100 dark:divide-surface-800">
            <InfoRow label="Name" value={user?.name ?? '—'} />
            <InfoRow label="Email" value={user?.email ?? '—'} />
            <InfoRow label="Role" value={<StatusBadge value={user?.role ?? ''} />} />
            <InfoRow label="Status" value={
              <span className={`text-sm font-medium ${user?.isActive ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {user?.isActive ? 'Active' : 'Inactive'}
              </span>
            } />
            <InfoRow label="Member since" value={user?.createAt ? formatDate(user.createAt) : '—'} />
          </div>
        </div>

        {/* Change password */}
        <div className="card">
          <div className="px-5 py-4 border-b border-surface-100 dark:border-surface-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-surface-400" />
              <h2 className="font-medium text-sm text-surface-900 dark:text-surface-100">Password</h2>
            </div>
            {!showPwdForm && (
              <button onClick={() => setShowPwdForm(true)} className="btn-secondary text-xs">
                Change password
              </button>
            )}
          </div>

          {showPwdForm ? (
            <form onSubmit={handleSubmit(onPasswordSubmit)} className="p-5 space-y-4">
              <div>
                <label htmlFor="cur-pwd" className="label">Current password</label>
                <input id="cur-pwd" type="password" autoComplete="current-password" className="input max-w-sm" {...register('currentPassword')} />
                {errors.currentPassword && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.currentPassword.message}</p>}
              </div>
              <div>
                <label htmlFor="new-pwd" className="label">New password</label>
                <input id="new-pwd" type="password" autoComplete="new-password" className="input max-w-sm" {...register('newPassword')} />
                {errors.newPassword && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.newPassword.message}</p>}
              </div>
              <div>
                <label htmlFor="confirm-pwd" className="label">Confirm new password</label>
                <input id="confirm-pwd" type="password" autoComplete="new-password" className="input max-w-sm" {...register('confirmPassword')} />
                {errors.confirmPassword && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.confirmPassword.message}</p>}
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={isSubmitting} className="btn-primary">
                  {isSubmitting ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                  Update password
                </button>
                <button type="button" onClick={() => { setShowPwdForm(false); reset(); }} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="px-5 py-4 text-sm text-surface-500">
              Use a strong password. Your password is never shown.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 text-sm">
      <span className="w-32 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
