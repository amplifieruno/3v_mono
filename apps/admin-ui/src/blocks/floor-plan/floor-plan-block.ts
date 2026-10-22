import { defineBlock, prop, source } from '@burojs/core';
import { z } from 'zod';
import { resourceByName } from '../../data/resource-by-name';
import { FLOOR_PLAN_RESOURCE, PLAN_AREA_RESOURCE } from '../../fields/plan-rows';

/** The most areas the plan reads at once (`source.list` allows 100); the count says when more exist. */
export const FLOOR_PLAN_AREA_LIMIT = 100;

const facilityOf = (plans: unknown): string | null => {
  const rows = (plans as { readonly rows?: readonly Readonly<Record<string, unknown>>[] } | null)
    ?.rows;
  const facility = rows?.[0]?.facility_id;
  return typeof facility === 'string' ? facility : null;
};

/**
 * A floor plan with what lies on it (`itap:floor-plan`): the plan's image, the shapes of its
 * area and of every area inside it (coloured by access level, labelled with occupancy against
 * capacity), and a legend linking each area. Props: `floorPlanId` (on the floor plan's page),
 * or `areaId` (on an area's page: the plan that area carries). Reads the plan, then its
 * facility's areas in path order; resources are named, not imported, because the area page
 * places this block.
 */
export const floorPlanBlock = defineBlock('itap:floor-plan', {
  texts: {
    label: 'Floor plan',
    none: 'No floor plan.',
    drawing: 'Floor plan {{name}} with its areas',
    legend: 'Areas on this plan',
    noShapes: 'No area on this plan has a shape yet. Edit an area to draw its shape.',
    occupancy: '{{occupancy}} / {{capacity}}',
    occupancyOnly: '{{occupancy}} inside',
    overCapacity: 'Over capacity',
    size: '{{width}} × {{height}} px',
    scale: '1 px = {{scale}} m',
    truncated:
      'Only the first {{shown}} of the facility’s {{total}} areas are read; some shapes may be missing.',
  },
  props: {
    floorPlanId: prop(z.string().nullable().optional()).default(null),
    areaId: prop(z.string().nullable().optional()).default(null),
  },
  data: {
    plans: ({ props }) =>
      source.list(resourceByName(FLOOR_PLAN_RESOURCE), {
        where: props.floorPlanId
          ? [{ field: 'id', op: 'eq', value: props.floorPlanId }]
          : [{ field: 'area_id', op: 'eq', value: props.areaId ?? null }],
        limit: 1,
      }),
    areas: ({ data }) =>
      source.list(resourceByName(PLAN_AREA_RESOURCE), {
        where: [{ field: 'facility_id', op: 'eq', value: facilityOf(data.plans) }],
        sort: [{ field: 'path', direction: 'asc' }],
        limit: FLOOR_PLAN_AREA_LIMIT,
        count: true,
      }),
  },
});
