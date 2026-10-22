import { type BlockViewProps, useCustomQuery, useDispatcher } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import { Check, CircleDashed, Clock, LoaderCircle, X } from 'lucide-react';
import * as React from 'react';
import { REPORT_RESOURCE } from '../../data/resource-names';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { reportProgressQuery } from '../../modules/analytics/report-ops';
import type { reportStatusBlock } from './report-status-block';
import { PENDING_STATUSES, REPORT_MAX_ATTEMPTS, type ReportStep, reportSteps } from './report-steps';

/** How often a queued or generating report is read again. */
export const REPORT_POLL_MS = 3000;

const ICONS = { done: Check, current: LoaderCircle, todo: CircleDashed, failed: X } as const;

type T = BlockViewProps<typeof reportStatusBlock>['t'];

function StepItem({ step, t }: { readonly step: ReportStep; readonly t: T }): React.ReactElement {
  const Icon = step.key === 'requested' && step.state === 'done' ? Clock : ICONS[step.state];
  const at = instantOf(step.at);
  const detail =
    step.key === 'generating' && step.attempt !== null
      ? t('attempt', { params: { attempt: step.attempt, max: REPORT_MAX_ATTEMPTS } })
      : step.key === 'generating' && step.state === 'todo'
        ? t('waiting')
        : null;
  return (
    <li className="flex items-center gap-2" data-testid={`report-step:${step.key}`} data-state={step.state}>
      <Icon
        aria-hidden
        className={cn(
          'size-4 shrink-0',
          step.state === 'current' && 'animate-spin text-primary',
          step.state === 'todo' && 'text-muted-foreground',
          step.state === 'failed' && 'text-destructive',
          step.state === 'done' && 'text-emerald-600 dark:text-emerald-400',
        )}
      />
      <span className={cn('font-medium', step.state === 'todo' && 'text-muted-foreground', step.state === 'failed' && 'text-destructive')}>
        {t(step.key)}
      </span>
      {at === null ? null : <span className="text-sm text-muted-foreground tabular-nums">{formatDateTime(at)}</span>}
      {detail === null ? null : <span className="text-sm text-muted-foreground">({detail})</span>}
    </li>
  );
}

/**
 * The report's progress as steps. Polls while the report is queued or generating; once it has moved
 * on from the status the page shows, the reports are read again through the dispatcher's `refetch`
 * effect so the page's file, error and Retry follow (a record page does not poll its record,
 * `tasks/ui/buro-gaps.md` G61).
 */
export function ReportStatusView({ props, t }: BlockViewProps<typeof reportStatusBlock>): React.ReactElement {
  const reportId = props.reportId ?? null;
  // The last status read decides whether to read again (a query's own answer cannot set its options).
  const [lastRead, setLastRead] = React.useState<string | null>(null);
  const pending = PENDING_STATUSES.has(lastRead ?? props.status ?? '');
  const progress = useCustomQuery(
    reportProgressQuery,
    { reportId: reportId ?? '' },
    { enabled: reportId !== null, refetchInterval: pending ? REPORT_POLL_MS : false },
  );
  const dispatcher = useDispatcher();
  const read = progress.data?.status ?? null;

  React.useEffect(() => {
    if (read === null) return;
    setLastRead(read);
    if (props.status !== null && read !== props.status) {
      // The page's record still shows the old status: read the reports again (as a mutation's effects do).
      void dispatcher.effects.refetch?.([REPORT_RESOURCE]);
    }
  }, [read, props.status, dispatcher]);

  if (progress.isError || progress.data === null) {
    return <p className="text-sm text-destructive" data-testid="report-status">{t('unreadable')}</p>;
  }
  if (progress.data === undefined) {
    return <p className="text-sm text-muted-foreground" data-testid="report-status">{t('loading')}</p>;
  }
  const steps = reportSteps(progress.data);
  return (
    <section className="flex flex-col gap-2" data-testid="report-status" aria-label={t('label')} data-status={progress.data.status}>
      <ol className="flex flex-col gap-1.5">
        {steps.map((step) => (
          <StepItem key={step.key} step={step} t={t} />
        ))}
      </ol>
      {progress.data.status === 'expired' ? <p className="text-sm text-muted-foreground">{t('expiredNote')}</p> : null}
      {pending ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t('live')}
        </p>
      ) : null}
    </section>
  );
}
