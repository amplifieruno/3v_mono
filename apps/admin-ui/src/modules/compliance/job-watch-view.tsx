import { type BlockViewProps, useCustomQuery, useDispatcher } from '@burojs/react';
import { LoaderCircle } from 'lucide-react';
import * as React from 'react';
import type { jobWatchBlock } from './job-watch-block';
import { JOB_RESOURCES, PENDING_JOB_STATUSES, jobStatusQuery } from './job-watch-query';

/** How often a queued or running job is read again. */
export const JOB_POLL_MS = 3000;

/**
 * Follows a queued or running sync run or export job: reads its status every few seconds and,
 * once it moved on from what the page shows, reads the page's resource again through the
 * dispatcher's `refetch` effect (counts, file and error follow). Renders nothing once ended.
 */
export function JobWatchView({ props, t }: BlockViewProps<typeof jobWatchBlock>): React.ReactElement | null {
  const id = props.id ?? null;
  const [lastRead, setLastRead] = React.useState<string | null>(null);
  const current = lastRead ?? props.status ?? '';
  const pending = PENDING_JOB_STATUSES.has(current);
  const progress = useCustomQuery(
    jobStatusQuery,
    { job: props.job, id: id ?? '' },
    { enabled: id !== null && PENDING_JOB_STATUSES.has(props.status ?? ''), refetchInterval: pending ? JOB_POLL_MS : false },
  );
  const dispatcher = useDispatcher();
  const read = progress.data?.status ?? null;

  React.useEffect(() => {
    if (read === null) return;
    setLastRead(read);
    if (props.status !== null && read !== props.status) void dispatcher.effects.refetch?.([JOB_RESOURCES[props.job]]);
  }, [read, props.status, props.job, dispatcher]);

  if (!PENDING_JOB_STATUSES.has(props.status ?? '')) return null;
  if (progress.isError) return <p className="text-sm text-destructive" data-testid="job-watch">{t('unreadable')}</p>;
  return (
    <p className="flex items-center gap-2 text-sm" data-testid="job-watch" data-status={current} aria-live="polite">
      <LoaderCircle aria-hidden className="size-4 shrink-0 animate-spin text-primary" />
      <span className="font-medium">{t(current === 'queued' ? 'queued' : 'running')}</span>
      <span className="text-muted-foreground">{t('live')}</span>
    </p>
  );
}
