import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      el.showModal();
    } else {
      el.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 m-auto rounded-md shadow-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-0 max-w-sm w-full backdrop:bg-black/40"
      onClose={onCancel}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-semibold text-surface-900 dark:text-surface-100">{title}</h2>
          <button
            onClick={onCancel}
            className="shrink-0 text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {description && (
          <p className="mt-2 text-sm text-surface-600 dark:text-surface-400">{description}</p>
        )}
        {children && <div className="mt-3">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="btn-secondary">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={cn(variant === 'danger' ? 'btn-danger' : 'btn-primary')}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
