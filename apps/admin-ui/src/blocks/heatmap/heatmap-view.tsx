import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { BlockNote } from '../charts/block-note';
import { formatFigure } from '../charts/chart-scale';
import { HeatGrid } from '../charts/heat-grid';
import { useFacilityPeriod } from '../facility-period/use-facility-period';
import { occupancySeries } from '../occupancy-series/occupancy-series-query';
import type { heatmapBlock } from './heatmap-block';
import { heatmapHours } from './heatmap-query';
import { type HeatRead, busiestCell, heatByArea, heatByWeekday, seriesHours } from './heatmap-shape';

const TEST_ID = 'heatmap';

/**
 * The heatmap block's view (`itap:heatmap`): the facility's zone first (whole facility days, its
 * clock hours), then the hours, from `area_hourly_stats` (`source: 'stats'`) or the facility's
 * hourly `occupancy_series` (`source: 'series'`, by weekday only); the averages as a grid of
 * shaded cells, one row per area or per day of the week, with a note when the read was cut.
 */
export function HeatmapView({ props, t }: BlockViewProps<typeof heatmapBlock>): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const fromSeries = props.source === 'series';
  const by = fromSeries ? 'weekday' : props.by;
  const period = useFacilityPeriod(facilityId, props.days);
  const span = period.status === 'ready' ? period.window : null;
  const input = { facilityId: facilityId ?? '', from: span?.from ?? '', to: span?.to ?? '' };
  const stats = useCustomQuery(heatmapHours, { ...input, by }, { enabled: span !== null && !fromSeries });
  const series = useCustomQuery(occupancySeries, { ...input, bucket: 'hour' }, { enabled: span !== null && fromSeries });
  const read: HeatRead | null | undefined = fromSeries
    ? series.data === undefined || series.data === null
      ? series.data
      : seriesHours(series.data)
    : stats.data;
  const failed = fromSeries ? series.isError : stats.isError;

  if (period.status === 'none') return <BlockNote testId={TEST_ID}>{t('chooseFacility')}</BlockNote>;
  if (period.status === 'missing') return <BlockNote testId={TEST_ID}>{t('missing')}</BlockNote>;
  if (period.status === 'failed' || failed || read === null) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (period.status === 'loading' || read === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;

  const zone = period.facility.timezone;
  const heat =
    by === 'weekday'
      ? heatByWeekday(read, period.window.days, zone)
      : heatByArea(read, period.window.days, zone, props.limit, t('unknownArea'));
  const busiest = busiestCell(heat);
  if (busiest === null) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  return (
    <section data-testid={TEST_ID} data-by={by} data-source={props.source} className="flex flex-col gap-2" aria-label={t('label')}>
      {read.truncated ? (
        <p className="text-xs text-warning-emphasis" role="note" data-testid={`${TEST_ID}:truncated`}>
          {t('truncated')}
        </p>
      ) : null}
      <HeatGrid
        testId={`${TEST_ID}:grid`}
        rows={heat.rows}
        columns={heat.columns}
        cells={heat.cells}
        ariaLabel={t(by === 'weekday' ? 'byWeekday' : 'byArea')}
        cornerLabel={t(by === 'weekday' ? 'weekdayHeader' : 'areaHeader')}
        summary={t('summary', { params: { row: busiest.row, hour: busiest.column, value: formatFigure(busiest.value) } })}
        describe={(row, column, value) =>
          value === null
            ? t('noFigure', { params: { row: row.label, hour: column.label } })
            : t('cell', { params: { row: row.label, hour: column.label, value: formatFigure(value) } })
        }
      />
      <p className="text-xs text-muted-foreground">{t('note', { params: { zone: zone ?? 'UTC' } })}</p>
    </section>
  );
}
