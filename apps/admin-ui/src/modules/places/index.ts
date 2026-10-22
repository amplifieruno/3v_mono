import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { AREA_RESOURCE, area, areaFields } from './area';
import { areaParentGuardBlock } from './area-parent-guard-block';
import { areaTreeBlock } from './area-tree-block';
import { FACILITY_RESOURCE, facility, facilityFields } from './facility';
import { facilityOccupancyNow, facilityOccupancyNowOperation } from './occupancy';
import { placesPlaceholderBlock } from './placeholder-block';

/**
 * Places: facilities (behind the sidebar facility picker too) with their occupancy now,
 * and their area trees; floor plans and access points join in later tasks of the phase.
 */
export const placesModule = {
  name: 'places-module',
  uses: [
    facility,
    area,
    facilityOccupancyNow,
    areaTreeBlock,
    areaParentGuardBlock,
    placesPlaceholderBlock,
  ],
  tables: {
    [FACILITY_RESOURCE]: hasuraTable('facilities', { selectFields: selectFieldsOf(facilityFields) }),
    [AREA_RESOURCE]: hasuraTable('areas', { selectFields: selectFieldsOf(areaFields) }),
  },
  operations: [facilityOccupancyNowOperation],
} as const satisfies ConsoleModule;
