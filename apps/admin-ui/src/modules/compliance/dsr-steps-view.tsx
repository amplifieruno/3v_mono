import { type BlockViewProps, useCustomQuery, useDispatcher } from '@burojs/react';
import { cn } from '@burojs/ui-shadcn';
import { Check, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useEnumLabel } from '../../blocks/charts/use-enum-label';
import { DSR_RESOURCE, LEGAL_HOLD_RESOURCE } from '../../data/resource-names';
import { RETENTION_DATA_CLASS_ENUM } from '../../enums/compliance';
import { formatDateTime, instantOf } from '../../fields/date-time-format';
import { RecordLink } from '../access/record-link';
import { type StepTone, stepLine } from './dsr-step-format';
import type { dsrStepsBlock } from './dsr-steps-block';
import { type DsrStep, dataSubjectRequestProgress, dsrPending, legalHoldNames, retainedOf } from './dsr-steps-query';

/** How often a request the job still works on is read again. */
export const DSR_POLL_MS = 3000;

type Props = BlockViewProps<typeof dsrStepsBlock>;
type T = Props['t'];

const ICONS: Record<StepTone, typeof Check> = { done: Check, warning: TriangleAlert, failed: CircleAlert, info: Info };

function StepItem({ step, t, classLabel }: { readonly step: DsrStep; readonly t: T; readonly classLabel: (value: string) => string }): React.ReactElement {
  const line = stepLine(step);
  const params = typeof line.params.dataClass === 'string' ? { ...line.params, dataClass: classLabel(line.params.dataClass) } : line.params;
  const Icon = ICONS[line.tone];
  const at = instantOf(step.at);
  return (
    <li className="flex items-start gap-2" data-testid={`dsr-step:${step.step}`}>
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          line.tone === 'done' && 'text-emerald-600 dark:text-emerald-400',
          line.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
          line.tone === 'failed' && 'text-destructive',
          line.tone === 'info' && 'text-muted-foreground',
        )}
      />
      <span className="flex flex-wrap gap-x-2">
        <span>{t(line.key, { params })}</span>
        {at === null ? null : <span className="text-sm text-muted-foreground tabular-nums">{formatDateTime(at)}</span>}
      </span>
    </li>
  );
}

function PartialNotice({ steps, t, classLabel }: { readonly steps: readonly DsrStep[]; readonly t: T; readonly classLabel: (value: string) => string }): React.ReactElement | null {
  const retained = retainedOf(steps);
  const holdIds = retained?.holdIds ?? [];
  const names = useCustomQuery(legalHoldNames, { holdIds }, { enabled: holdIds.length > 0 });
  if (retained === null) return null;
  const category = (value: string): string =>
    value === 'profile' || value === 'identities' ? t(`category_${value}`) : classLabel(value);
  return (
    <div role="status" data-testid="dsr-partial" className="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
      <p className="font-medium">{t('partialTitle')}</p>
      <p>
        {t('partialText')} <span data-testid="dsr-partial-categories">{retained.categories.map(category).join(', ')}</span>
      </p>
      {holdIds.length === 0 ? null : (
        <p className="flex flex-wrap items-center gap-1">
          {t('partialHolds')}
          {holdIds.map((id, index) => (
            <React.Fragment key={id}>
              {index > 0 ? ', ' : null}
              <RecordLink resource={LEGAL_HOLD_RESOURCE} id={id} name={names.data?.[id] ?? t('holdFallback')} fallback={t('holdFallback')} />
            </React.Fragment>
          ))}
        </p>
      )}
    </div>
  );
}

/**
 * The request's steps (`itap:dsr-steps`). Polls while the job works on the request; once the
 * status moved on from what the page shows, reads the requests again through the dispatcher's
 * `refetch` effect (a record page does not poll its record, G61).
 */
export function DsrStepsView({ props, t }: Props): React.ReactElement {
  const requestId = props.requestId ?? null;
  const [lastRead, setLastRead] = React.useState<{ status: string; lease: string | null } | null>(null);
  const pending = lastRead === null ? props.status === 'received' || props.status === 'in_progress' : dsrPending({ status: lastRead.status, lease_expires_at: lastRead.lease });
  const progress = useCustomQuery(
    dataSubjectRequestProgress,
    { requestId: requestId ?? '' },
    { enabled: requestId !== null, refetchInterval: pending ? DSR_POLL_MS : false },
  );
  const dispatcher = useDispatcher();
  const classLabel = useEnumLabel(RETENTION_DATA_CLASS_ENUM);
  const read = progress.data ?? null;
  const readStatus = read?.status ?? null;
  const readLease = read?.lease_expires_at ?? null;

  React.useEffect(() => {
    if (readStatus === null) return;
    setLastRead({ status: readStatus, lease: readLease });
    // The page's record still shows the old status: read the requests again (as a mutation's effects do).
    if (props.status !== null && readStatus !== props.status) void dispatcher.effects.refetch?.([DSR_RESOURCE]);
  }, [readStatus, readLease, props.status, dispatcher]);

  if (progress.isError || progress.data === null) return <p className="text-sm text-destructive" data-testid="dsr-steps">{t('unreadable')}</p>;
  if (progress.data === undefined) return <p className="text-sm text-muted-foreground" data-testid="dsr-steps">{t('loading')}</p>;
  const { steps } = progress.data;
  return (
    <section className="flex flex-col gap-2" data-testid="dsr-steps" aria-label={t('label')} data-status={progress.data.status}>
      <PartialNotice steps={steps} t={t} classLabel={classLabel} />
      {steps.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('none')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm">
          {steps.map((step) => (
            <StepItem key={step.id} step={step} t={t} classLabel={classLabel} />
          ))}
        </ol>
      )}
      {dsrPending(progress.data) ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t('live')}
        </p>
      ) : null}
    </section>
  );
}
