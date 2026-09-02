import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useEvent } from '@/modules/events/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDate } from '@/lib/utils';
import { ROUTES } from '@/constants';

export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { data: event, isLoading, isError, refetch } = useEvent(eventId!);
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(event?._id ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) {
    return (
      <div>
        <PageHeader title="Event" />
        <div className="p-6 space-y-3">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full max-w-lg" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div>
        <PageHeader title="Event" />
        <ErrorState onRetry={() => refetch()} message="Unable to load event details." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Event Detail"
        description={event._id}
        actions={
          <button onClick={() => navigate(ROUTES.EVENTS)} className="btn-secondary">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Events
          </button>
        }
      />

      <div className="p-6 grid lg:grid-cols-2 gap-4 max-w-5xl">
        {/* Meta card */}
        <div className="card divide-y divide-surface-100 dark:divide-surface-800">
          <div className="px-4 py-3">
            <h2 className="font-medium text-sm text-surface-700 dark:text-surface-300">Event Information</h2>
          </div>

          <InfoRow
            label="Event ID"
            value={
              <div className="flex items-center gap-1.5">
                <code className="text-xs font-mono truncate max-w-[180px]">{event._id}</code>
                <button
                  onClick={copyId}
                  className="text-surface-400 hover:text-surface-700 transition-colors"
                  aria-label="Copy ID"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            }
          />
          <InfoRow label="Type" value={<code className="text-xs font-mono">{event.type}</code>} />
          <InfoRow label="Channel" value={<StatusBadge value={event.channel} />} />
          <InfoRow label="Status" value={<StatusBadge value={event.status} />} />
          <InfoRow label="Created" value={formatDate(event.createdAt)} />
          <InfoRow label="Updated" value={formatDate(event.updatedAt)} />
        </div>

        {/* Payload card */}
        <div className="card">
          <div className="px-4 py-3 border-b border-surface-100 dark:border-surface-800">
            <h2 className="font-medium text-sm text-surface-700 dark:text-surface-300">Payload</h2>
          </div>
          <div className="p-4">
            <pre className="text-xs font-mono text-surface-700 dark:text-surface-300 bg-surface-50 dark:bg-surface-950 p-3 rounded border border-surface-200 dark:border-surface-800 overflow-auto max-h-80">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 text-sm">
      <span className="w-24 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
