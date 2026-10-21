import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { FACILITY_STATUSES, FACILITY_STATUS_ENUM } from '../../enums/places';

export const FACILITY_RESOURCE = 'facility';

const statusField = f.enum(FACILITY_STATUSES, {
  texts: {
    label: 'Status',
    doc: {
      summary:
        'Whether the site is in operation. Under maintenance and inactive sites stay visible with their history.',
    },
  },
  meta: { enumNamespace: FACILITY_STATUS_ENUM },
});

/** Columns of `itap.facilities` this phase reads; `mapping.ts` selects exactly these. */
export const facilityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    generated: 'always',
    write: 'never',
    texts: {
      label: 'Code',
      doc: {
        summary:
          'Reference assigned by the system when the facility is created (`FACILITY-00001`), unique within the organization and never reused.',
      },
    },
  }),
  name: f.string({ texts: 'Name' }),
  timezone: f.string({
    texts: {
      label: 'Time zone',
      doc: {
        summary:
          'IANA zone (for example `Europe/Moscow`) in which the facility’s operating hours, schedules and daily statistics are evaluated.',
      },
    },
  }),
  status: { ...statusField, ui: { ...statusField.ui, enum: FACILITY_STATUS_ENUM } },
  created_at: f.dateTime({ system: true, texts: 'Created' }),
};

/**
 * A facility (site) of the organization. Read-only in this phase: it backs the
 * facility picker that narrows facility-bound lists; managing places comes
 * with the places module.
 */
export const facility = defineResource(FACILITY_RESOURCE, {
  texts: {
    label: 'Facility',
    labelPlural: 'Facilities',
    doc: {
      summary:
        'A physical site of the organization, such as a building or campus. Areas, devices and access points belong to one facility.',
    },
  },
  displayField: 'name',
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  data: { provider: 'hasura' },
  fields: facilityFields,
  views: {
    list: { page: false },
  },
});
