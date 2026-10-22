import { type InferBlockData, resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp, useCustomQuery } from '@burojs/react';
import { Button } from '@burojs/ui-shadcn';
import * as React from 'react';
import { AREA_RESOURCE } from '../../data/resource-names';
import { type FloorPlanRow, areasOnPlan, floorPlanOf, planAreaOf, rowsOf } from '../../fields/plan-rows';
import { FloorPlanFigure } from '../floor-plan/floor-plan-figure';
import { OccupancyAreaList } from './occupancy-area-list';
import { OccupancyLegend } from './occupancy-legend';
import { OCCUPANCY_LEVEL_CLASSES, areaTree, facilityTotal, occupancyLevel, withOccupancy } from './occupancy-level';
import type { occupancyNowBlock } from './occupancy-now-block';
import { type OccupancyRow, occupancyRows } from './occupancy-query';

/** How often the figures are read again while the page is open, in milliseconds. */
export const OCCUPANCY_REFRESH_MS = 15_000;

type Props = BlockViewProps<typeof occupancyNowBlock>;

/** The plan shown first: the one whose area holds the most people now (the first one on a tie). */
function busiestPlan(plans: readonly FloorPlanRow[], rows: readonly OccupancyRow[]): FloorPlanRow | null {
  const people = (plan: FloorPlanRow): number => rows.find((row) => row.area_id === plan.area_id)?.occupancy ?? 0;
  return plans.reduce<FloorPlanRow | null>((best, plan) => (best === null || people(plan) > people(best) ? plan : best), null);
}

/** The occupancy page's block (`itap:occupancy-now`): total, plan coloured by occupancy, area tree. */
export function OccupancyNowView({ props, data, t }: Props): React.ReactElement {
  const facilityId = props.facilityId ?? null;
  const app = useApp();
  const occupancy = useCustomQuery(occupancyRows, { facilityId: facilityId ?? '' }, {
    enabled: facilityId !== null,
    refetchInterval: OCCUPANCY_REFRESH_MS,
  });
  const { plans, areas } = data as Partial<InferBlockData<typeof occupancyNowBlock>>;
  const planRows = rowsOf(plans?.rows, floorPlanOf);
  const [chosen, setChosen] = React.useState<string | null>(null);
  if (facilityId === null) return <p className="text-sm text-muted-foreground">{t('chooseFacility')}</p>;
  if (occupancy.isError) return <p className="text-sm text-destructive">{t('failed')}</p>;
  if (occupancy.data === undefined) return <p className="text-sm text-muted-foreground">{t('loading')}</p>;

  const rows = occupancy.data;
  const allAreas = withOccupancy(rowsOf(areas?.rows, planAreaOf), rows);
  const plan = planRows.find((row) => row.id === chosen) ?? busiestPlan(planRows, rows);
  const def = app.registry.get(AREA_RESOURCE);
  const hrefOf = (id: string): string => resourceShowHref(app.registry, def, AREA_RESOURCE, id);
  const total = typeof areas?.total === 'number' ? areas.total : (areas?.rows.length ?? 0);
  const time = new Date(occupancy.dataUpdatedAt).toLocaleTimeString();

  return (
    <div className="flex flex-col gap-4" data-testid="occupancy-now">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm">
          {t('onSite')}: <span className="text-2xl font-semibold tabular-nums" data-testid="occupancy-total">{facilityTotal(rows)}</span>
        </p>
        <p className="text-xs text-muted-foreground">{t('updated', { params: { time } })}</p>
      </div>
      {plan === null ? (
        <p className="text-sm text-muted-foreground">{t('noPlan')}</p>
      ) : (
        <section aria-label={t('plans')} className="flex flex-col gap-2">
          {planRows.length > 1 ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('plans')}>
              {planRows.map((row) => (
                <Button
                  key={row.id}
                  type="button"
                  size="sm"
                  variant={row.id === plan.id ? 'default' : 'outline'}
                  aria-pressed={row.id === plan.id}
                  onClick={() => setChosen(row.id)}
                >
                  {row.name}
                </Button>
              ))}
            </div>
          ) : null}
          <FloorPlanFigure
            plan={plan}
            areas={areasOnPlan(allAreas, plan, planRows)}
            accessPoints={[]}
            shapeClassOf={(area) => OCCUPANCY_LEVEL_CLASSES[occupancyLevel(area.current_occupancy ?? 0, area.capacity)].shape}
            t={t}
          />
          <OccupancyLegend t={t} />
          {total > (areas?.rows.length ?? 0) ? (
            <p className="text-xs text-muted-foreground">
              {t('truncated', { params: { shown: areas?.rows.length ?? 0, total } })}
            </p>
          ) : null}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t('areas')}</h3>
        <OccupancyAreaList entries={areaTree(rows)} hrefOf={hrefOf} t={t} />
      </section>
    </div>
  );
}
