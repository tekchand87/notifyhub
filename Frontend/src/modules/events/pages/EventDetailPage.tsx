import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Check, Hash, Clock, Radio,
  AlertTriangle, RefreshCw, Server, Zap
} from 'lucide-react';
import { useState } from 'react';
import { useEvent } from '@/modules/events/hooks/useEvents';
import { PageHeader } from '@/components/layout/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { formatDate } from '@/lib/utils';
import { ROUTES } from '@/constants';
import { cn } from '@/lib/utils';
import type { Event } from '@/types';

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

  const isProcessing = event.status === 'processing';
  const isFailed = event.status === 'failed' || event.status === 'dlq';
  const isRetrying = event.status === 'retry_wait';
  const isTerminal = event.status === 'delivered' || event.status === 'failed' || event.status === 'dlq';

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

            {/* ── Lifecycle timestamps ── */}
            {event.deliveredAt && (
              <InfoRow label="Delivered" value={
                <span className="font-mono text-2xs text-success-600">{formatDate(event.deliveredAt)}</span>
              } />
            )}
            {event.failedAt && (
              <InfoRow label="Failed at" value={
                <span className="font-mono text-2xs text-error-600">{formatDate(event.failedAt)}</span>
              } />
            )}
            {event.dlqAt && (
              <InfoRow label="DLQ at" value={
                <span className="font-mono text-2xs text-warning-600">{formatDate(event.dlqAt)}</span>
              } />
            )}
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

        {/* ── Delivery Tracking ───────────────────────── */}
        <div className="card overflow-hidden lg:col-span-2">
          <div className={cn(
            'flex items-center justify-between px-4 py-3 border-b',
            'border-surface-100 dark:border-[#2a2d32]',
          )}>
            <div className="flex items-center gap-2">
              <RefreshCw className="w-3.5 h-3.5 text-surface-400" />
              <h2 className="text-xs font-semibold text-surface-800 dark:text-surface-200 uppercase tracking-wide">
                Delivery Tracking
              </h2>
            </div>
            <span className={cn(
              'text-2xs px-2 py-0.5 rounded-full font-medium',
              event.attempts === 0
                ? 'bg-surface-100 dark:bg-surface-800 text-surface-500'
                : 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300',
            )}>
              {event.attempts ?? 0} / {event.maxAttempts ?? '?'} attempts
            </span>
          </div>

          <div className="divide-y divide-surface-50 dark:divide-[#2a2d32]">
            {/* Last error */}
            {event.lastError && (
              <div className="px-4 py-3 flex items-start gap-3">
                <AlertTriangle className="w-3.5 h-3.5 text-error-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-2xs font-medium text-error-700 dark:text-error-400 mb-0.5">Last Error</p>
                  <p className="text-2xs font-mono text-surface-600 dark:text-surface-400 break-all">
                    {event.lastError}
                  </p>
                </div>
              </div>
            )}

            {/* Next retry */}
            {isRetrying && event.nextRetryAt && (
              <div className="px-4 py-3 flex items-start gap-3">
                <Clock className="w-3.5 h-3.5 text-warning-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-2xs font-medium text-warning-700 dark:text-warning-400 mb-0.5">Next Retry</p>
                  <p className="text-2xs font-mono text-surface-600 dark:text-surface-400">
                    {formatDate(event.nextRetryAt)}
                  </p>
                </div>
              </div>
            )}

            {/* Worker lease info (only shown while processing) */}
            {isProcessing && event.workerId && (
              <div className="px-4 py-3 flex items-start gap-3">
                <Server className="w-3.5 h-3.5 text-primary-500 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-2xs font-medium text-primary-700 dark:text-primary-400 mb-1">
                    Currently Processing
                  </p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    <span className="text-2xs text-surface-400">Worker</span>
                    <code className="text-2xs font-mono text-surface-600 dark:text-surface-400 truncate">
                      {event.workerId}
                    </code>
                    {event.processingStartedAt && (
                      <>
                        <span className="text-2xs text-surface-400">Started</span>
                        <span className="text-2xs font-mono text-surface-600 dark:text-surface-400">
                          {formatDate(event.processingStartedAt)}
                        </span>
                      </>
                    )}
                    {event.leaseExpiresAt && (
                      <>
                        <span className="text-2xs text-surface-400">Lease expires</span>
                        <span className="text-2xs font-mono text-surface-600 dark:text-surface-400">
                          {formatDate(event.leaseExpiresAt)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* No error, not processing, not retrying */}
            {!event.lastError && !isProcessing && !isRetrying && (
              <div className="px-4 py-6 text-center">
                <p className="text-2xs text-surface-400">
                  {isTerminal ? 'Processing complete.' : 'Awaiting processing.'}
                </p>
              </div>
            )}
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
