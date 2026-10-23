import { type BlockViewProps, useCustomQuery, useDispatcher } from '@burojs/react';
import { Progress, cn } from '@burojs/ui-shadcn';
import * as React from 'react';
import { pollWhile } from '../../data/poll-while';
import { BULK_JOB_RESOURCE, BULK_JOB_ROW_RESOURCE } from '../../data/resource-names';
import { BULK_PENDING_STATUSES } from '../../enums/bulk';
import { type BulkJobProgress, bulkJobProgressQuery } from '../../modules/search/bulk-job-ops';
import { notProcessed, progressPercent } from '../../modules/search/bulk-job-shape';
import { BlockNote } from '../charts/block-note';
import { BULK_POLL_MS, bulkJobPending } from './bulk-job-polling';
import type { bulkJobProgressBlock } from './bulk-job-progress-block';

const TEST_ID = 'bulk-job-progress';

type T = BlockViewProps<typeof bulkJobProgressBlock>['t'];

function Count({ label, value, tone }: { readonly label: string; readonly value: number; readonly tone?: 'bad' | 'muted' }): React.ReactElement {
  return (
    <div className="flex flex-col" data-count={label}>
      <span className={cn('text-lg font-semibold tabular-nums', tone === 'bad' && value > 0 && 'text-destructive', tone === 'muted' && 'text-muted-foreground')}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function Summary({ job, t }: { readonly job: BulkJobProgress; readonly t: T }): React.ReactElement | null {
  if (job.total === null) return null;
  const missing = notProcessed(job);
  const params = { total: job.total, succeeded: job.succeeded, failed: job.failed, skipped: job.skipped, notReached: missing };
  return (
    <p className="text-sm" data-testid="bulk-job-sum">
      {missing > 0 ? t('sumNotReached', { params }) : t('sum', { params })}
    </p>
  );
}

/**
 * The job's progress. Reads the job every two seconds while it is queued or running (bounded by
 * `BULK_POLL_LIMIT_MS`); when the counts or the status move, the job and its rows are read again
 * through the dispatcher's `refetch` effect, so the page's status, rows, error, result file, Retry and
 * Cancel follow (a record page does not poll its record, `tasks/ui/buro-gaps.md` G61).
 */
export function BulkJobProgressView({ props, t }: BlockViewProps<typeof bulkJobProgressBlock>): React.ReactElement {
  const jobId = props.jobId ?? null;
  const status = props.status ?? null;
  const [since, setSince] = React.useState(() => Date.now());
  const progress = useCustomQuery(
    bulkJobProgressQuery,
    { jobId: jobId ?? '' },
    { enabled: jobId !== null, refetchInterval: pollWhile<BulkJobProgress | null>((job) => bulkJobPending(job, status, since, Date.now()), BULK_POLL_MS) },
  );
  const dispatcher = useDispatcher();
  const job = progress.data;
  const { refetch } = progress;
  const jobStatus = job?.status ?? null;

  // A new run of the job (a retry, another attempt) gets its own 30 minutes of reading.
  const windowKey = `${status ?? ''}|${jobStatus ?? ''}|${job?.attempts ?? ''}`;
  const windowSeen = React.useRef(windowKey);
  React.useEffect(() => {
    if (windowSeen.current === windowKey) return;
    windowSeen.current = windowKey;
    setSince(Date.now());
  }, [windowKey]);

  // The page's job moved on (Retry or Cancel answered) while this block's read is older, or no
  // longer polling: read it again, which also starts polling again while it is pending.
  React.useEffect(() => {
    if (status !== null && jobStatus !== null && jobStatus !== status) void refetch();
  }, [status, jobStatus, refetch]);
  const key = job ? `${job.status}|${job.processed}|${job.succeeded}|${job.failed}|${job.skipped}` : null;
  const seen = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (key === null || job === null || job === undefined) return;
    const previous = seen.current;
    seen.current = key;
    if ((previous !== null && previous !== key) || (status !== null && job.status !== status)) {
      // The page's job and rows still show the earlier state: read them again (as a mutation's effects do).
      void dispatcher.effects.refetch?.([BULK_JOB_RESOURCE, BULK_JOB_ROW_RESOURCE]);
    }
  }, [key, job, status, dispatcher]);

  if (jobId === null || progress.isError || job === null) return <BlockNote testId={TEST_ID} tone="error">{t('unreadable')}</BlockNote>;
  if (job === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  const moving = BULK_PENDING_STATUSES.has(job.status);
  const live = bulkJobPending(job, status, since, Date.now());
  const percent = progressPercent(job);
  const attempt = job.attempts - job.attempts_at_retry;
  return (
    <section className="flex flex-col gap-3" data-testid={TEST_ID} data-status={job.status} aria-label={t('label')}>
      {job.status === 'queued' ? <p className="text-sm text-muted-foreground">{t('waiting')}</p> : null}
      {percent === null ? (
        job.status === 'running' ? <p className="text-sm text-muted-foreground">{t('reading')}</p> : null
      ) : (
        <div className="flex flex-col gap-1">
          <Progress value={percent} aria-label={t('label')} />
          <span className="text-sm text-muted-foreground tabular-nums" data-testid="bulk-job-rows-read">
            {t('rows', { params: { processed: job.processed, total: job.total } })}
            {moving && attempt > 1 ? ` · ${t('attempt', { params: { attempt } })}` : ''}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-6" data-testid="bulk-job-counts">
        <Count label={t('succeeded')} value={job.succeeded} />
        <Count label={t('failed')} value={job.failed} tone="bad" />
        <Count label={t('skipped')} value={job.skipped} tone="muted" />
        {!moving && notProcessed(job) > 0 ? <Count label={t('notReached')} value={notProcessed(job)} tone="muted" /> : null}
      </div>
      {moving ? null : <Summary job={job} t={t} />}
      {job.status === 'cancelled' ? <p className="text-sm text-muted-foreground">{t('cancelled')}</p> : null}
      {live ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t('live')}
        </p>
      ) : moving ? (
        <p className="text-xs text-muted-foreground">{t('stale')}</p>
      ) : null}
    </section>
  );
}
