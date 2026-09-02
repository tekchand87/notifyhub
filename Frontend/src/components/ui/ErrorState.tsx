import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'Unable to load data. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <AlertTriangle className="w-8 h-8 text-red-400 mb-3" />
      <p className="font-medium text-surface-800 dark:text-surface-200">{title}</p>
      <p className="mt-1 text-sm text-surface-500">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary mt-4 btn">
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
