import { type BlockViewProps, useCustomQuery } from '@burojs/react';
import { EnumBadge } from '@burojs/ui-shadcn';
import type * as React from 'react';
import { EVENT_SEVERITY_ENUM } from '../../enums/events';
import { dashboardKpis } from '../../modules/overview/kpis';
import { BlockNote } from '../charts/block-note';
import { shortDay } from '../charts/zoned-time';
import { StackedBar } from '../charts/stacked-bar';
import { severityParts } from './kpi-severities';
import type { kpisBlock } from './kpis-block';

const TEST_ID = 'kpis';

/**
 * The KPI block's view (`itap:kpis`): the chosen figures as tiles, then (with `details`) the open
 * incidents by severity and the segments that moved most since yesterday, with the moment the
 * figures were computed.
 */
export function KpisView({ props, t }: BlockViewProps<typeof kpisBlock>): React.ReactElement {
  const kpis = useCustomQuery(dashboardKpis, {});
  if (kpis.isError) return <BlockNote testId={TEST_ID} tone="error">{t('failed')}</BlockNote>;
  if (kpis.data === undefined) return <BlockNote testId={TEST_ID}>{t('loading')}</BlockNote>;
  if (kpis.data === null) return <BlockNote testId={TEST_ID}>{t('none')}</BlockNote>;
  const figures = kpis.data;
  const parts = severityParts(figures).map((part) => ({
    ...part,
    legend: <EnumBadge enumName={EVENT_SEVERITY_ENUM} value={part.key} presentation="plain" />,
  }));
  return (
    <section data-testid={TEST_ID} className="flex flex-col gap-4" aria-label={t('label')}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {props.figures.map((figure) => (
          <div key={figure} className="flex flex-col gap-1 rounded-md border p-3" data-testid={`kpi:${figure}`}>
            <dt className="text-xs text-muted-foreground">{t(figure)}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{figures[figure]}</dd>
          </div>
        ))}
      </dl>
      {props.details ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('severities')}</h3>
            {figures.open_incidents === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noIncidents')}</p>
            ) : (
              <StackedBar testId={`${TEST_ID}:severities`} parts={parts} ariaLabel={t('severityChart')} legend />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('movers')}</h3>
            {figures.segment_top_movers.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noMovers')}</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-md border text-sm" data-testid={`${TEST_ID}:movers`}>
                {figures.segment_top_movers.map((mover) => (
                  <li key={mover.segment_id} className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <span className="truncate">{mover.name}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="text-xs text-muted-foreground">
                        {t('moverCounts', { params: { previous: mover.previous_count, current: mover.member_count } })}
                      </span>
                      <span className={mover.change > 0 ? 'font-medium text-success-emphasis' : 'font-medium text-destructive'}>
                        {mover.change > 0 ? `+${mover.change}` : `−${Math.abs(mover.change)}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t('asOf', { params: { time: new Date(figures.as_of).toLocaleTimeString(), day: shortDay(figures.local_date) } })}
      </p>
    </section>
  );
}
