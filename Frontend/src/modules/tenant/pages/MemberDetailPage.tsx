import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { useMember, useUpdateMember } from '@/modules/tenant/hooks/useMembers';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge, ActiveBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/modules/auth/AuthContext';
import { formatDate } from '@/lib/utils';
import { extractErrorMessage } from '@/lib/utils';
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
        <div className="p-6 space-y-3">
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
          <button
            onClick={() => navigate(ROUTES.MEMBERS)}
            className="btn-secondary"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Members
          </button>
        }
      />

      <div className="p-6 grid lg:grid-cols-3 gap-4 max-w-4xl">
        {/* Detail card */}
        <div className="lg:col-span-2 card divide-y divide-surface-100 dark:divide-surface-800">
          <div className="px-4 py-3">
            <h2 className="font-medium text-sm text-surface-700 dark:text-surface-300">Member Information</h2>
          </div>
          <InfoRow label="Name" value={member.name} />
          <InfoRow label="Email" value={member.email} />
          <InfoRow label="Role" value={<StatusBadge value={member.role} />} />
          <InfoRow label="Status" value={<ActiveBadge isActive={member.isActive} />} />
          <InfoRow label="Created" value={formatDate(member.createdAt)} />
          <InfoRow label="Updated" value={formatDate(member.updatedAt)} />
        </div>

        {/* Actions card */}
        <div className="card p-4 h-fit space-y-3">
          <h2 className="font-medium text-sm text-surface-700 dark:text-surface-300 border-b border-surface-100 dark:border-surface-800 pb-2">
            Actions
          </h2>

          {/* Role change */}
          <div>
            <label htmlFor="role-select" className="label">Change Role</label>
            <select
              id="role-select"
              value={member.role}
              onChange={(e) => handleRoleChange(e.target.value as UserRole)}
              disabled={isPending}
              className="input"
            >
              <option value="member">Member</option>
              <option value="tenant_admin">Admin</option>
            </select>
          </div>

          {/* Activate / Deactivate */}
          {member.isActive ? (
            <button
              onClick={() => setConfirmAction({ type: 'deactivate' })}
              disabled={isPending || isSelf}
              className="btn-danger w-full justify-center"
              title={isSelf ? 'You cannot deactivate your own account' : undefined}
            >
              Deactivate
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction({ type: 'activate' })}
              disabled={isPending}
              className="btn-primary w-full justify-center"
            >
              Activate
            </button>
          )}

          {isSelf && (
            <p className="text-xs text-surface-400 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              You cannot deactivate yourself
            </p>
          )}
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
        confirmLabel={
          confirmAction?.type === 'deactivate' ? 'Deactivate' : 'Confirm'
        }
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className="w-28 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
