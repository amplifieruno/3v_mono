import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { FACILITY_RESOURCE, facility, facilityFields } from './facility';
import { facilityOccupancyNow, facilityOccupancyNowOperation } from './occupancy';
import { placesPlaceholderBlock } from './placeholder-block';

/**
 * Places: facilities (behind the sidebar facility picker too) with their occupancy now;
 * areas, floor plans and access points join in later tasks of the phase.
 */
export const placesModule = {
  name: 'places-module',
  uses: [facility, facilityOccupancyNow, placesPlaceholderBlock],
  tables: {
    [FACILITY_RESOURCE]: hasuraTable('facilities', { selectFields: selectFieldsOf(facilityFields) }),
  },
  operations: [facilityOccupancyNowOperation],
} as const satisfies ConsoleModule;
