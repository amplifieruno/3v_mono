import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { recordDate } from '../people/record-date';
import { IDENTITY_LOCATION_RESOURCE } from '../../data/resource-names';
import { identityLocationFields } from './identity-location-fields';

/** Page size of the location lists. */
export const IDENTITY_LOCATION_PAGE_SIZE = 50;

/**
 * Identity locations (`itap.identity_locations`): each place a person was seen in, one row per
 * change of area or door (not per detection). Written by the tracking pipeline only, an
 * append-only log: newest first, keyset paging, no count on every page.
 */
export const identityLocation = defineResource(IDENTITY_LOCATION_RESOURCE, {
  texts: {
    label: 'Location',
    labelPlural: 'Locations',
    doc: {
      summary:
        'A step of a person’s path: the area entered or the door passed, when, and the camera that saw it. A session’s locations in order are its path.',
    },
  },
  basePath: '/locations',
  section: NAV_SECTIONS.monitoring,
  order: 30,
  icon: NAV_ICONS.identityLocations,
  displayField: 'occurred_at',
  recordTitle: (record) => recordDate('Location at', record.occurred_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: identityLocationFields,
  views: {
    list: {
      columns: ['occurred_at', 'movement_type', 'identity_id', 'area_id', 'access_point_id', 'device_id'],
      defaultSort: [{ field: 'occurred_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: IDENTITY_LOCATION_PAGE_SIZE,
      filters: {
        pinned: ['area_id', 'movement_type', 'occurred_at'],
        fields: ['area_id', 'access_point_id', 'device_id', 'identity_id', 'movement_type', 'occurred_at', 'facility_id'],
      },
    },
    show: {
      header: (l) => [l.grid(['occurred_at', 'movement_type', 'area_id'])],
      body: (l) => [
        l.grid(['identity_id', 'session_id', 'detection_id']),
        l.grid(['facility_id', 'access_point_id', 'device_id']),
        l.grid(['confidence', 'is_estimated', 'uncertainty_m']),
        'position',
        'created_at',
      ],
    },
  },
});
