import { useList } from '@burojs/react';
import * as React from 'react';
import {
  FLOOR_PLAN_RESOURCE,
  type FloorPlanRow,
  PLAN_AREA_RESOURCE,
  type PlanAreaRow,
  areaChain,
  areasOnPlan,
  floorPlanOf,
  planAreaOf,
  planOfChain,
  rowsOf,
} from './plan-rows';

/** More floor plans and areas than one facility holds; one page of each is read. */
const PLANS_PAGE_SIZE = 100;
const AREAS_PAGE_SIZE = 500;

export type PlanContextState =
  | { readonly status: 'no-facility' }
  | { readonly status: 'pending' }
  | { readonly status: 'error' }
  /** The place lies on no floor plan (neither it nor an enclosing area has one). */
  | { readonly status: 'none' }
  | {
      readonly status: 'ready';
      readonly plan: FloorPlanRow;
      /** The areas with a shape drawn on the plan. */
      readonly areas: readonly PlanAreaRow[];
    };

export interface PlanContextInput {
  readonly facilityId: string | null;
  /** The area being edited (its own plan comes first), or `null`. */
  readonly selfId: string | null;
  /** The area the place sits in (a parent, an access point's area), or `null`. */
  readonly startId: string | null;
}

/**
 * The floor plan a place lies on, for the plan-space inputs: the facility's plans and areas
 * (two list reads, never narrowed by the facility picker), then the nearest plan outwards
 * from the place (`planOfChain`).
 */
export function usePlanContext({
  facilityId,
  selfId,
  startId,
}: PlanContextInput): PlanContextState {
  const enabled = facilityId !== null;
  const facilityFilter = { field: 'facility_id', op: 'eq', value: facilityId ?? '' } as const;
  const plans = useList(FLOOR_PLAN_RESOURCE, {
    scope: 'none',
    filter: facilityFilter,
    pagination: { kind: 'offset', page: 1, pageSize: PLANS_PAGE_SIZE },
    enabled,
  });
  const areas = useList(PLAN_AREA_RESOURCE, {
    scope: 'none',
    filter: facilityFilter,
    pagination: { kind: 'offset', page: 1, pageSize: AREAS_PAGE_SIZE },
    enabled,
  });
  const planRows = plans.data?.data;
  const areaRows = areas.data?.data;
  return React.useMemo((): PlanContextState => {
    if (!enabled) return { status: 'no-facility' };
    if (plans.isError || areas.isError) return { status: 'error' };
    if (planRows === undefined || areaRows === undefined) return { status: 'pending' };
    const allAreas = rowsOf(areaRows, planAreaOf);
    const plan = planOfChain(areaChain(selfId, startId, allAreas), rowsOf(planRows, floorPlanOf));
    if (plan === null) return { status: 'none' };
    return { status: 'ready', plan, areas: areasOnPlan(allAreas, plan.area_id) };
  }, [enabled, plans.isError, areas.isError, planRows, areaRows, selfId, startId]);
}

/** A string form value or record value, else `null`. */
export function idOf(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}
