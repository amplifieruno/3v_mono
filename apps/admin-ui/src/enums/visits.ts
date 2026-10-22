import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Visit enums; values are the rows of the Hasura enum tables in `VISIT_ENUM_TABLES`. */

export const VISIT_STATUS_ENUM = 'visit_status';

export const VISIT_STATUSES = ['scheduled', 'checked_in', 'checked_out', 'cancelled', 'no_show'] as const;

export const visitStatusEnum = defineEnum({
  name: VISIT_STATUS_ENUM,
  values: enumValues(VISIT_STATUSES, {
    scheduled: 'info',
    checked_in: 'success',
    checked_out: 'secondary',
    cancelled: 'secondary',
    no_show: 'warning',
  }),
  texts: {
    scheduled: {
      label: 'Scheduled',
      doc: { summary: 'Expected and not arrived yet: can be checked in, cancelled or still edited.' },
    },
    checked_in: {
      label: 'Checked in',
      doc: { summary: 'The visitor arrived and is on site; check out when they leave.' },
    },
    checked_out: { label: 'Checked out', doc: { summary: 'The visitor has left; the visit is history.' } },
    cancelled: { label: 'Cancelled', doc: { summary: 'Called off before the visitor arrived, with the reason.' } },
    no_show: {
      label: 'No-show',
      doc: {
        summary: 'The visitor never arrived: the daily lifecycle job marks visits whose expected end passed unchecked.',
      },
    },
  },
});

/** Each enum above by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const VISIT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [VISIT_STATUS_ENUM]: 'visit_statuses',
};
