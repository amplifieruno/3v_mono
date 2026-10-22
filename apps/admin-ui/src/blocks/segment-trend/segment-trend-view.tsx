import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { BlockNote } from '../charts/block-note';
import { LineChart } from '../charts/line-chart';
import type { segmentTrendBlock } from './segment-trend-block';
import { segmentTrend } from './segment-trend-query';
import { segmentTrends } from './segment-trend-shape';

const TEST_ID = 'segment-trend';

/**
 * The segment trend block's view (`itap:segment-trend`): one member-count line per segment, the
 * organization's days ending today at the moment the answer arrived (one clock).
 */
export function SegmentTrendView({ props, t }: BlockViewProps<typeof segmentTrendBlock>): React.ReactElement {
  const read = useCustomQuery(segmentTrend, { segmentId: props.segmentId ?? null, days: props.days });
  if (read.isError || read.data === null) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (read.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  const trends = segmentTrends(read.data, new Date(read.dataUpdatedAt), props.days, props.limit);
  if (trends.length === 0) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-2" aria-label={t('label')}>
      {read.data.truncated ? (
        <p className="text-xs text-warning-emphasis" role="note" data-testid={`${TEST_ID}:truncated`}>
          {t('truncated')}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
      {trends.map((trend) => (
        <LineChart
          key={trend.id}
          testId={`${TEST_ID}:${trend.id}`}
          points={trend.points}
          title={trend.name}
          summary={t('latest', {
            params: { value: trend.latest ?? '—', change: trend.change > 0 ? `+${trend.change}` : String(trend.change) },
          })}
          ariaLabel={t('chart', { params: { name: trend.name } })}
          axisLabel={t('day')}
          start={trend.points[0]?.label}
          end={t('today')}
        />
      ))}
      </div>
    </section>
  );
}
