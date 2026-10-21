import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Places enums; values are the rows of the Hasura enum tables in `PLACES_ENUM_TABLES`. */

export const FACILITY_STATUS_ENUM = 'facility_status';

export const FACILITY_STATUSES = ['active', 'inactive', 'maintenance'] as const;

export const facilityStatusEnum = defineEnum({
  name: FACILITY_STATUS_ENUM,
  values: enumValues(FACILITY_STATUSES, {
    active: 'success',
    inactive: 'secondary',
    maintenance: 'warning',
  }),
  texts: {
    active: 'Active',
    maintenance: {
      label: 'Under maintenance',
      doc: { summary: 'Temporarily out of normal operation; its devices may be offline.' },
    },
    inactive: { label: 'Inactive', doc: { summary: 'Not in use; kept for its history.' } },
  },
});

/** Each places enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const PLACES_ENUM_TABLES: Readonly<Record<string, string>> = {
  [FACILITY_STATUS_ENUM]: 'facility_statuses',
};
