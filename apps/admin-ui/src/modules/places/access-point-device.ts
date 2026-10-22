import { defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { enumField } from '../../enums/field';
import { ACCESS_POINT_DEVICE_ROLES, ACCESS_POINT_DEVICE_ROLE_ENUM } from '../../enums/places';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  ACCESS_POINT_RESOURCE,
  DEVICE_RESOURCE,
  FACILITY_RESOURCE,
} from '../../data/resource-names';

const sameFacility = [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }] as const;

/**
 * Columns of `itap.access_point_devices` the `org_admin` role reads. Both keys are relations
 * (with their Hasura relationship names), so the access point's and the device's links read
 * across them.
 */
export const accessPointDeviceFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    required: true,
    write: 'create',
    texts: {
      label: 'Facility',
      doc: { summary: 'The facility of the access point; the device must belong to the same one.' },
    },
  }),
  access_point_id: f.relation({
    to: ACCESS_POINT_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    candidates: [...sameFacility],
    providerOptions: { relationship: 'access_point' },
    texts: { label: 'Access point', doc: { summary: 'The passage the device serves.' } },
  }),
  device_id: f.relation({
    to: DEVICE_RESOURCE,
    required: true,
    write: 'create',
    open: 'page',
    candidates: [...sameFacility],
    providerOptions: { relationship: 'device' },
    texts: {
      label: 'Device',
      doc: {
        summary:
          'The camera, access terminal or sensor bound to the access point; it must belong to the access point’s facility, and is bound at most once per access point.',
      },
    },
  }),
  role: enumField(ACCESS_POINT_DEVICE_ROLES, ACCESS_POINT_DEVICE_ROLE_ENUM, {
    required: true,
    default: 'camera',
    texts: {
      label: 'Role',
      doc: {
        summary:
          'What the device does at the access point: a camera watches it (detections are placed there), a terminal decides and opens, a sensor reports the passage state.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Bound', in: ['list', 'show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};

/**
 * The devices bound to an access point (the junction `access_point_devices`). It has no page of
 * its own: the access point's Devices tab and the device's Access points tab list, add and
 * remove bindings, and both records show the other side as a read link.
 */
export const accessPointDevice = defineResource(ACCESS_POINT_DEVICE_RESOURCE, {
  texts: {
    label: 'Bound device',
    labelPlural: 'Bound devices',
    doc: {
      summary:
        'A device (camera, access terminal or sensor) of the facility bound to one access point with the role it plays there.',
    },
  },
  basePath: '/access-point-devices',
  displayField: 'device_id',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  fields: accessPointDeviceFields,
  views: {
    list: { page: false, columns: ['device_id', 'role', 'access_point_id', 'created_at'] },
    show: { page: false },
    edit: { body: (l) => [l.grid(['facility_id', 'access_point_id']), l.grid(['device_id', 'role'])] },
  },
});
