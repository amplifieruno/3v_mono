import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { AREA_RESOURCE, area, areaFields } from './area';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { areaTreeBlock } from './area-tree-block';
import { floorPlanBlock } from '../../blocks/floor-plan/floor-plan-block';
import { FACILITY_RESOURCE, facility, facilityFields } from './facility';
import { FLOOR_PLAN_RESOURCE, floorPlan, floorPlanFields } from './floor-plan';
import { facilityOccupancyNow, facilityOccupancyNowOperation } from './occupancy';
import { placesPlaceholderBlock } from './placeholder-block';

/**
 * Places: facilities (behind the sidebar facility picker too) with their occupancy now,
 * their area trees, and floor plans with the areas drawn on them; access points join in a
 * later task of the phase.
 */
export const placesModule = {
  name: 'places-module',
  uses: [
    facility,
    area,
    floorPlan,
    facilityOccupancyNow,
    areaTreeBlock,
    areaParentGuardBlock,
    floorPlanBlock,
    placesPlaceholderBlock,
  ],
  tables: {
    [FACILITY_RESOURCE]: hasuraTable('facilities', { selectFields: selectFieldsOf(facilityFields) }),
    [AREA_RESOURCE]: hasuraTable('areas', { selectFields: selectFieldsOf(areaFields) }),
    [FLOOR_PLAN_RESOURCE]: hasuraTable('floor_plans', {
      selectFields: selectFieldsOf(floorPlanFields),
    }),
  },
  operations: [facilityOccupancyNowOperation],
} as const satisfies ConsoleModule;
