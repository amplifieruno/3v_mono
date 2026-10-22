import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { BlockNote } from '../charts/block-note';
import { formatFigure } from '../charts/chart-scale';
import { HeatGrid } from '../charts/heat-grid';
import { useFacilityPeriod } from '../facility-period/use-facility-period';
import type { heatmapBlock } from './heatmap-block';
import { heatmapHours } from './heatmap-query';
import { heatByArea, heatByWeekday } from './heatmap-shape';

const TEST_ID = 'heatmap';

/**
 * The heatmap block's view (`itap:heatmap`): the facility's zone first (whole facility days, its
 * clock hours), then the hourly rows; the averages as a grid of shaded cells, one row per area or
 * per day of the week.
 */
export function HeatmapView({ props, t }: BlockViewProps<typeof heatmapBlock>): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const period = useFacilityPeriod(facilityId, props.days);
  const span = period.status === 'ready' ? period.window : null;
  const hours = useCustomQuery(
    heatmapHours,
    { facilityId: facilityId ?? '', from: span?.from ?? '', to: span?.to ?? '', by: props.by },
    { enabled: span !== null },
  );

  if (period.status === 'none') return <BlockNote testId={TEST_ID}>{t('chooseFacility')}</BlockNote>;
  if (period.status === 'missing') return <BlockNote testId={TEST_ID}>{t('missing')}</BlockNote>;
  if (period.status === 'failed' || hours.isError || hours.data === null) {
    return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  }
  if (period.status === 'loading' || hours.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;

  const zone = period.facility.timezone;
  const heat =
    props.by === 'weekday'
      ? heatByWeekday(hours.data, period.window.days, zone)
      : heatByArea(hours.data, period.window.days, zone, props.limit, t('unknownArea'));
  if (!heat.cells.some((line) => line.some((value) => value !== null && value > 0))) {
    return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  }
  return (
    <section data-testid={TEST_ID} data-by={props.by} className="flex flex-col gap-2" aria-label={t('label')}>
      <HeatGrid
        testId={`${TEST_ID}:grid`}
        rows={heat.rows}
        columns={heat.columns}
        cells={heat.cells}
        ariaLabel={t(props.by === 'weekday' ? 'byWeekday' : 'byArea')}
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
