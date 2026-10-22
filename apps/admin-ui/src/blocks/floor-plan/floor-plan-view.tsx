import { type InferBlockData, resourceShowHref } from '@burojs/core';
import { type BlockViewProps, useApp } from '@burojs/react';
import type * as React from 'react';
import {
  areasOnPlan,
  floorPlanOf,
  placedOnPlan,
  planAccessPointOf,
  planAreaOf,
  planDeviceOf,
  rowsOf,
} from '../../fields/plan-rows';
import type { floorPlanBlock } from './floor-plan-block';
import { FloorPlanFigure } from './floor-plan-figure';
import { FloorPlanLegend } from './floor-plan-legend';
import { AREA_RESOURCE } from '../../data/resource-names';

/**
 * The floor plan block's view (`itap:floor-plan`): the drawing, its size and scale, the legend
 * of the areas on it, and the access points and devices positioned on it.
 */
export function FloorPlanView({
  data,
  t,
}: BlockViewProps<typeof floorPlanBlock>): React.ReactElement {
  const app = useApp();
  const {
    plans,
    areas,
    facilityPlans,
    accessPoints: pointRows,
    devices: deviceRows,
  } = data as Partial<InferBlockData<typeof floorPlanBlock>>;
  const plan = floorPlanOf(plans?.rows[0]);
  if (plan === null || areas === undefined) {
    return <p className="text-sm text-muted-foreground">{t('none')}</p>;
  }
  const allAreas = rowsOf(areas.rows, planAreaOf);
  const facilityPlanRows = rowsOf(facilityPlans?.rows, floorPlanOf);
  const onPlan = areasOnPlan(allAreas, plan, facilityPlanRows);
  const accessPoints = placedOnPlan(
    rowsOf(pointRows?.rows, planAccessPointOf),
    allAreas,
    plan,
    facilityPlanRows,
  );
  const devices = placedOnPlan(rowsOf(deviceRows?.rows, planDeviceOf), allAreas, plan, facilityPlanRows);
  const def = app.registry.get(AREA_RESOURCE);
  const hrefOf = (id: string): string =>
    resourceShowHref(app.registry, def, AREA_RESOURCE, id);
  const total = typeof areas.total === 'number' ? areas.total : areas.rows.length;
  const scale = (plans?.rows[0] as Readonly<Record<string, unknown>> | undefined)?.scale_m_per_px;

  return (
    <div data-testid="floor-plan" className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t('size', { params: { width: plan.size.width, height: plan.size.height } })}
        {typeof scale === 'number' ? ` · ${t('scale', { params: { scale } })}` : null}
      </p>
      <FloorPlanFigure
        plan={plan}
        areas={onPlan}
        accessPoints={accessPoints}
        devices={devices}
        t={t}
      />
      {onPlan.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noShapes')}</p>
      ) : (
        <FloorPlanLegend areas={onPlan} hrefOf={hrefOf} t={t} />
      )}
      {total > areas.rows.length ? (
        <p className="text-sm text-muted-foreground">
          {t('truncated', { params: { shown: areas.rows.length, total } })}
        </p>
      ) : null}
    </div>
  );
}
