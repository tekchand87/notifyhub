import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Copy, Check, Hash, Clock, Radio } from 'lucide-react';
import { useState } from 'react';
import { useEvent } from '@/modules/events/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDate } from '@/lib/utils';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';

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
        <div className="p-6 space-y-3 max-w-5xl">
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-32 w-full" />
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
        {/* ── Event Information ──────────────────────── */}
        <div className="card overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Hash className="w-3.5 h-3.5 text-surface-400" />
            <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
              Event Information
            </h2>
          </div>

          <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
            {/* Event ID row with copy */}
            <div className="flex items-center gap-4 px-4 py-2.5 text-xs">
              <span className="w-24 shrink-0 text-surface-500 dark:text-surface-400">Event ID</span>
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <code className="font-mono text-2xs text-surface-600 dark:text-surface-400 truncate">
                  {event._id}
                </code>
                <button
                  onClick={copyId}
                  className="shrink-0 text-surface-400 hover:text-primary-700 dark:hover:text-primary-400 transition-colors"
                  aria-label="Copy ID"
                >
                  {copied
                    ? <Check className="w-3.5 h-3.5 text-success-600" />
                    : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <InfoRow label="Type" value={
              <code className="font-mono text-xs text-surface-700 dark:text-surface-300">{event.type}</code>
            } />
            <InfoRow label="Channel" value={<StatusBadge value={event.channel} />} />
            <InfoRow label="Status" value={<StatusBadge value={event.status} />} />
            <InfoRow label="Created" value={
              <span className="font-mono text-2xs text-surface-500">{formatDate(event.createdAt)}</span>
            } />
            <InfoRow label="Updated" value={
              <span className="font-mono text-2xs text-surface-500">{formatDate(event.updatedAt)}</span>
            } />
          </div>
        </div>

        {/* ── Payload ────────────────────────────────── */}
        <div className="card overflow-hidden">
          <div className={cn(
            'flex items-center gap-2 px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <Radio className="w-3.5 h-3.5 text-surface-400" />
            <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
              Payload
            </h2>
          </div>
          <div className="p-4">
            <pre className={cn(
              'text-2xs font-mono p-3 rounded border overflow-auto max-h-80 leading-relaxed',
              'text-surface-700 dark:text-surface-300',
              'bg-surface-50 dark:bg-[#111214]',
              'border-surface-200 dark:border-[#2a2d32]',
            )}>
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
    <div className="flex items-center gap-4 px-4 py-2.5 text-xs">
      <span className="w-24 shrink-0 text-surface-500 dark:text-surface-400">{label}</span>
      <span className="flex-1 text-surface-900 dark:text-surface-100">{value}</span>
    </div>
  );
}
