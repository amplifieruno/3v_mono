import { defineBlock, prop, source } from '@burojs/core';
import { z } from 'zod';
import { resourceByName } from '../../data/resource-by-name';
import { AREA_RESOURCE, FLOOR_PLAN_RESOURCE } from '../../data/resource-names';
import { PLAN_AREA_LIMIT } from '../../fields/plan-rows';

/**
 * Who is in each area of a facility now (`itap:occupancy-now`): the facility's floor plans with
 * their areas coloured by occupancy against capacity (one plan at a time, chosen above the
 * drawing), and every area of the facility as a tree with its figures. The figures are
 * `facility_occupancy_now`, read again every 15 seconds; the block's reads are the plans and the
 * areas' shapes. Prop `facilityId` (the sidebar facility on the occupancy page); without one the
 * block asks for a facility and reads nothing.
 */
export const occupancyNowBlock = defineBlock('itap:occupancy-now', {
  texts: {
    label: 'Occupancy now',
    chooseFacility: 'Choose a facility in the sidebar to see who is in it now.',
    loading: 'Reading the occupancy…',
    failed: 'The occupancy could not be read.',
    onSite: 'On site now',
    updated: 'Updated {{time}}; read again every 15 seconds.',
    plans: 'Floor plans',
    noPlan: 'This facility has no floor plan yet: the areas are listed below.',
    areas: 'Areas',
    noAreas: 'This facility has no areas.',
    area: 'Area',
    people: 'People',
    direct: '{{count}} here, the rest in sub-areas',
    level_empty: 'Empty',
    level_occupied: 'Occupied (no capacity set)',
    level_low: 'Under half full',
    level_medium: 'Half full or more',
    level_high: 'Nearly full',
    level_over: 'Over capacity',
    legend: 'Colours by occupancy',
    drawing: 'Floor plan {{name}} coloured by occupancy',
    occupancy: '{{occupancy}} / {{capacity}}',
    occupancyOnly: '{{occupancy}} inside',
    overCapacity: 'Over capacity',
    truncated: 'Only the first {{shown}} of the facility’s {{total}} areas have shapes read; some may be missing on the plan.',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
  },
  data: {
    plans: ({ props }) =>
      source.list(resourceByName(FLOOR_PLAN_RESOURCE), {
        where: [{ field: 'facility_id', op: 'eq', value: props.facilityId ?? null }],
        sort: [{ field: 'name', direction: 'asc' }],
        limit: PLAN_AREA_LIMIT,
      }),
    areas: ({ props }) =>
      source.list(resourceByName(AREA_RESOURCE), {
        where: [{ field: 'facility_id', op: 'eq', value: props.facilityId ?? null }],
        sort: [{ field: 'path', direction: 'asc' }],
        limit: PLAN_AREA_LIMIT,
        count: true,
      }),
  },
});
