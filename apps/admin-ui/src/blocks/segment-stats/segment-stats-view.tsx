import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { SegmentChurnChart } from './segment-churn-chart';
import { SegmentMembersChart } from './segment-members-chart';
import type { segmentStatsBlock } from './segment-stats-block';
import { segmentDailyStats } from './segment-stats-query';

/**
 * The segment trend block's view (`itap:segment-stats`): the member count and the churn over the
 * last 30 days, one small chart each (never two scales on one axis), with the window's ends
 * written under them. While reading, on a failed read and without any figure in the window it
 * says so.
 */
export function SegmentStatsView({ props, t }: BlockViewProps<typeof segmentStatsBlock>): React.ReactElement {
  const segmentId = props.segmentId ?? null;
  const series = useCustomQuery(segmentDailyStats, { segmentId: segmentId ?? '' }, { enabled: segmentId !== null });
  const points = series.data?.points ?? [];

  if (series.isError) {
    return (
      <p data-testid="segment-stats" className="text-sm text-destructive">
        {t('failed')}
      </p>
    );
  }
  if (series.data === undefined) {
    return (
      <p data-testid="segment-stats" className="text-sm text-muted-foreground">
        {t('loading')}
      </p>
    );
  }
  if (!points.some((point) => point.members !== null)) {
    return (
      <p data-testid="segment-stats" className="text-sm text-muted-foreground">
        {t('none')}
      </p>
    );
  }
  return (
    <section data-testid="segment-stats" className="flex flex-col gap-2" aria-label={t('label')}>
      <div className="grid gap-4 md:grid-cols-2">
        <SegmentMembersChart points={points} t={t} />
        <SegmentChurnChart points={points} t={t} />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{t('start')}</span>
        <span>{t('today')}</span>
      </div>
    </section>
  );
}
