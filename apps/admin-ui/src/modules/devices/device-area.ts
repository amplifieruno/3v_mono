import { defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  AREA_RESOURCE,
  DEVICE_AREA_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
} from '../../data/resource-names';

/** Columns of `itap.device_areas` the `org_admin` role reads. */
export const deviceAreaFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    write: 'create',
    texts: {
      label: 'Facility',
      doc: { summary: 'The facility of the device; the covered area must belong to the same one.' },
    },
  }),
  device_id: f.relation({
    to: DEVICE_RESOURCE,
    required: true,
    write: 'create',
    providerOptions: { relationship: 'device' },
    texts: { label: 'Device', doc: { summary: 'The device that sees the area.' } },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    providerOptions: { relationship: 'area' },
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }],
    texts: {
      label: 'Area',
      doc: {
        summary:
          'An area of the device’s facility it also sees, besides its primary area; each area is listed once per device.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Added', in: ['list', 'show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * The further areas a device covers (the junction `device_areas`; the primary area is the
 * device's own `area_id`). No page of its own: the device's Areas tab lists, adds and removes
 * them, and the device's "Also covers" link shows them.
 */
export const deviceArea = defineResource(DEVICE_AREA_RESOURCE, {
  texts: {
    label: 'Covered area',
    labelPlural: 'Covered areas',
    doc: {
      summary:
        'An area of the facility a device also sees, besides the area it is installed in.',
    },
  },
  basePath: '/device-areas',
  displayField: 'area_id',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  // Rows are added and removed, never changed (`org_admin` updates no column).
  operations: { edit: false },
  fields: deviceAreaFields,
  views: {
    list: { page: false, columns: ['area_id', 'device_id', 'created_at'] },
    show: { page: false },
    create: { body: (l) => [l.grid(['facility_id', 'device_id']), 'area_id'] },
  },
});
