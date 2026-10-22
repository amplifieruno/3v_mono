import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { BarChart } from '../charts/bar-chart';
import { BlockNote } from '../charts/block-note';
import { LineChart } from '../charts/line-chart';
import { hourWindow, seriesBucket } from '../charts/period';
import { useFacilityPeriod } from '../facility-period/use-facility-period';
import type { occupancySeriesBlock } from './occupancy-series-block';
import { occupancySeries } from './occupancy-series-query';
import { peopleLine, seriesPoints, seriesTotals } from './occupancy-series-shape';

const TEST_ID = 'occupancy-series';

/**
 * The occupancy series block's view (`itap:occupancy-series`): the facility's zone first (it sets
 * the period's day boundaries), then the series for that period; the people line and the entries
 * and exits columns, one chart each (never two scales on one axis), and the period's peak.
 */
export function OccupancySeriesView({ props, t }: BlockViewProps<typeof occupancySeriesBlock>): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const bucket = seriesBucket(props.days, props.bucket);
  const period = useFacilityPeriod(facilityId, props.days);
  const bounds = period.status === 'ready' ? (bucket === 'day' ? period.window : hourWindow(period.now, props.days)) : null;
  const series = useCustomQuery(
    occupancySeries,
    { facilityId: facilityId ?? '', from: bounds?.from ?? '', to: bounds?.to ?? '', bucket },
    { enabled: bounds !== null },
  );

  if (period.status === 'none') return <BlockNote testId={TEST_ID}>{t('chooseFacility')}</BlockNote>;
  if (period.status === 'missing') return <BlockNote testId={TEST_ID}>{t('missing')}</BlockNote>;
  if (period.status === 'failed' || series.isError || series.data === null) {
    return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  }
  if (period.status === 'loading' || series.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;

  const zone = period.facility.timezone;
  const points = seriesPoints(series.data, bucket, zone);
  if (!points.some((point) => point.people > 0 || point.entries > 0 || point.exits > 0)) {
    return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  }
  const totals = seriesTotals(points);
  const people = peopleLine(points);
  const start = points[0]?.label;
  const end = points[points.length - 1]?.label;
  return (
    <section data-testid={TEST_ID} data-bucket={bucket} className="flex flex-col gap-3" aria-label={t('label')}>
      <p className="text-sm">
        {t('peak', { params: { peak: totals.peak, when: totals.peakAt ?? '—' } })}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <LineChart
          testId={`${TEST_ID}:people`}
          points={people}
          title={t('people')}
          summary={t('peopleSummary', { params: { max: Math.max(...points.map((point) => point.people)) } })}
          ariaLabel={t(bucket === 'day' ? 'peopleDayChart' : 'peopleHourChart')}
          axisLabel={t(bucket)}
          start={start}
          end={end}
        />
        <BarChart
          testId={`${TEST_ID}:flow`}
          points={points.map((point) => ({ key: point.key, label: point.label, up: point.entries, down: point.exits }))}
          title={t('flow')}
          summary={t('flowSummary', { params: { entries: totals.entries, exits: totals.exits } })}
          ariaLabel={t('flowChart')}
          axisLabel={t(bucket)}
          upLabel={t('entries')}
          downLabel={t('exits')}
          describe={(bar) => t('flowPoint', { params: { label: bar.label, entries: bar.up, exits: bar.down ?? 0 } })}
          start={start}
          end={end}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t('zone', { params: { zone: zone ?? 'UTC' } })}</p>
    </section>
  );
}
