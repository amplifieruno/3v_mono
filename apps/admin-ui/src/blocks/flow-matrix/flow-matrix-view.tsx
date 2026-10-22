import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import type * as React from 'react';
import { BlockNote } from '../charts/block-note';
import { HeatGrid } from '../charts/heat-grid';
import { useFacilityPeriod } from '../facility-period/use-facility-period';
import type { flowMatrixBlock } from './flow-matrix-block';
import { flowMatrix } from './flow-matrix-query';
import { flowGrid } from './flow-matrix-shape';

const TEST_ID = 'flow-matrix';

/**
 * The flow matrix block's view (`itap:flow-matrix`): the facility's zone first (the period is whole
 * facility days), then the moves; the matrix of the busiest areas with each count written in its
 * cell, and the most frequent moves.
 */
export function FlowMatrixView({ props, t }: BlockViewProps<typeof flowMatrixBlock>): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const period = useFacilityPeriod(facilityId, props.days);
  const span = period.status === 'ready' ? period.window : null;
  const flows = useCustomQuery(
    flowMatrix,
    { facilityId: facilityId ?? '', from: span?.from ?? '', to: span?.to ?? '' },
    { enabled: span !== null },
  );

  if (period.status === 'none') return <BlockNote testId={TEST_ID}>{t('chooseFacility')}</BlockNote>;
  if (period.status === 'missing') return <BlockNote testId={TEST_ID}>{t('missing')}</BlockNote>;
  if (period.status === 'failed' || flows.isError || flows.data === null) {
    return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  }
  if (period.status === 'loading' || flows.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;

  const grid = flowGrid(flows.data, props.limit, t('unknownArea'));
  if (grid.total === 0) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-3" aria-label={t('label')}>
      <p className="text-xs text-muted-foreground">{t('axes', { params: { total: grid.total } })}</p>
      <HeatGrid
        testId={`${TEST_ID}:grid`}
        rows={grid.areas}
        columns={grid.areas}
        cells={grid.cells}
        slantColumns
        showValues
        ariaLabel={t('matrix')}
        cornerLabel={t('corner')}
        summary={
          grid.top[0] === undefined
            ? undefined
            : t('summary', { params: { from: grid.top[0].from, to: grid.top[0].to, count: grid.top[0].count, total: grid.total } })
        }
        describe={(from, to, value) => t('cell', { params: { from: from.label, to: to.label, count: value ?? 0 } })}
      />
      {grid.hidden > 0 ? <p className="text-xs text-muted-foreground">{t('others', { params: { count: grid.hidden } })}</p> : null}
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">{t('top')}</h3>
        <ol className="flex flex-col divide-y rounded-md border text-sm" data-testid={`${TEST_ID}:top`}>
          {grid.top.map((move) => (
            <li key={`${move.from}:${move.to}`} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="truncate">{t('move', { params: { from: move.from, to: move.to } })}</span>
              <span className="tabular-nums font-medium">{move.count}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
