import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, User, Shield } from 'lucide-react';
import { useMember, useUpdateMember } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/modules/auth/AuthContext';
import { formatDate, extractErrorMessage, cn } from '@/lib/utils';
import { ROUTES } from '@/constants';
import type { UserRole } from '@/types';

export function MemberDetailPage() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { data: member, isLoading, isError, refetch } = useMember(memberId!);
  const { mutateAsync: updateMember, isPending } = useUpdateMember(memberId!);
  const toast = useToast();

  const [confirmAction, setConfirmAction] = useState<null | {
    type: 'role' | 'activate' | 'deactivate';
    newRole?: UserRole;
  }>(null);

  const isSelf = currentUser?.id === memberId;

  const handleRoleChange = (newRole: UserRole) => {
    setConfirmAction({ type: 'role', newRole });
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === 'role' && confirmAction.newRole) {
        await updateMember({ role: confirmAction.newRole });
        toast.success('Role updated successfully');
      } else if (confirmAction.type === 'activate') {
        await updateMember({ isActive: true });
        toast.success('Member activated');
      } else if (confirmAction.type === 'deactivate') {
        await updateMember({ isActive: false });
        toast.success('Member deactivated');
      }
      setConfirmAction(null);
    } catch (err) {
      toast.error('Action failed', extractErrorMessage(err));
      setConfirmAction(null);
    }
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Member" />
        <div className="p-6 space-y-3 max-w-4xl">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div>
        <PageHeader title="Member" />
        <ErrorState onRetry={() => refetch()} message="Unable to load member details." />
      </div>
    );
  }

  const confirmDescription = (() => {
    if (confirmAction?.type === 'role') {
      return `Change ${member.name}'s role from "${member.role}" to "${confirmAction.newRole}"? This will affect their permissions.`;
    }
    if (confirmAction?.type === 'deactivate') {
      return `Deactivate ${member.name}? They will no longer be able to access the platform.`;
    }
    return `Activate ${member.name}?`;
  })();

  return (
    <div>
      <PageHeader
        title="Member Detail"
        description={member.email}
        actions={
          <button onClick={() => navigate(ROUTES.MEMBERS)} className="btn-secondary">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Members
          </button>
        }
      />

      <div className="p-6 grid lg:grid-cols-3 gap-4 max-w-4xl">
        {/* ── Member info card ──────────────────────── */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <User className="w-3.5 h-3.5 text-surface-400" />
            <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
              Member Information
            </h2>
          </div>
          <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
            <InfoRow label="Name" value={
              <span className="font-medium text-surface-900 dark:text-surface-100">{member.name}</span>
            } />
            <InfoRow label="Email" value={
              <code className="font-mono text-2xs text-surface-600 dark:text-surface-400">{member.email}</code>
            } />
            <InfoRow label="Role" value={<StatusBadge value={member.role} />} />
            <InfoRow label="Status" value={<ActiveBadge isActive={member.isActive} />} />
            <InfoRow label="Created" value={
              <span className="font-mono text-2xs text-surface-500">{formatDate(member.createdAt)}</span>
            } />
            <InfoRow label="Updated" value={
              <span className="font-mono text-2xs text-surface-500">{formatDate(member.updatedAt)}</span>
            } />
          </div>
        </div>

        {/* ── Actions card ──────────────────────────── */}
        <div className="card overflow-hidden h-fit">
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Shield className="w-3.5 h-3.5 text-surface-400" />
            <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
              Actions
            </h2>
          </div>

          <div className="p-4 space-y-4">
            {/* Role change */}
            <div className="field">
              <label htmlFor="role-select" className="label">Change Role</label>
              <select
                id="role-select"
                value={member.role}
                onChange={(e) => handleRoleChange(e.target.value as UserRole)}
                disabled={isPending || isSelf}
                className="input"
              >
                <option value="member">Member</option>
                <option value="tenant_admin">Admin</option>
              </select>
              {isSelf && (
                <p className="text-2xs text-surface-400 mt-1">You cannot change your own role</p>
              )}
            </div>

            {/* Separator */}
            <div className="border-t border-surface-100 dark:border-[#2a2d32]" />

            {/* Activate / Deactivate */}
            {member.isActive ? (
              <button
                onClick={() => setConfirmAction({ type: 'deactivate' })}
                disabled={isPending || isSelf}
                className="btn-danger w-full justify-center"
                title={isSelf ? 'You cannot deactivate your own account' : undefined}
              >
                Deactivate member
              </button>
            ) : (
              <button
                onClick={() => setConfirmAction({ type: 'activate' })}
                disabled={isPending}
                className="btn-primary w-full justify-center"
              >
                Activate member
              </button>
            )}

            {isSelf && (
              <p className={cn(
                'text-2xs flex items-center gap-1.5',
                'text-surface-400 dark:text-surface-500',
              )}>
                <AlertTriangle className="w-3 h-3 shrink-0" />
                You cannot deactivate yourself
              </p>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.type === 'role'
            ? 'Change Role'
            : confirmAction?.type === 'deactivate'
            ? 'Deactivate Member'
            : 'Activate Member'
        }
        description={confirmDescription}
        variant={confirmAction?.type === 'deactivate' ? 'danger' : 'default'}
        confirmLabel={confirmAction?.type === 'deactivate' ? 'Deactivate' : 'Confirm'}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-2.5 text-xs">
      <span className="w-24 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
