import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import type { ConsoleModule } from '../module';
import { FACILITY_RESOURCE, facility, facilityFields } from './facility';

/** Places: facilities (read-only in phase 0, behind the facility picker). */
export const placesModule = {
  name: 'places-module',
  uses: [facility],
  tables: {
    [FACILITY_RESOURCE]: hasuraTable('facilities', { selectFields: selectFieldsOf(facilityFields) }),
  },
} as const satisfies ConsoleModule;
