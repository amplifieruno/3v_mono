import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { recordDate } from '../people/record-date';
import { AREA_OCCUPANCY_RESOURCE } from '../../data/resource-names';
import { areaOccupancyFields } from './area-occupancy-fields';

/** How often the "who is where" lists read again while open, in milliseconds. */
export const OCCUPANCY_POLL_MS = 15_000;

/** Page size of the "who is where" lists. */
export const AREA_OCCUPANCY_PAGE_SIZE = 50;

/** The columns of the "who is where" lists. */
export const AREA_OCCUPANCY_COLUMNS = ['identity_id', 'area_id', 'facility_id', 'entered_at', 'last_seen_at'] as const;

/**
 * Who is where now (`itap.area_occupancy`): one row per person and facility, the innermost area
 * the person was last seen in. Current state, not a log: the pipeline moves the row as the
 * person moves and removes it when the session ends. The list polls while it is open.
 */
export const areaOccupancy = defineResource(AREA_OCCUPANCY_RESOURCE, {
  texts: {
    label: 'Presence',
    labelPlural: 'Who is where',
    doc: {
      summary:
        'Where each person tracked in a facility is right now: the area they were last seen in, since when, and when last. A person leaves the list when their session ends.',
    },
  },
  basePath: '/who-is-where',
  section: NAV_SECTIONS.monitoring,
  order: 40,
  icon: NAV_ICONS.whoIsWhere,
  displayField: 'entered_at',
  recordTitle: (record) => recordDate('Presence since', record.entered_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: areaOccupancyFields,
  views: {
    list: {
      columns: [...AREA_OCCUPANCY_COLUMNS],
      defaultSort: [{ field: 'last_seen_at', direction: 'desc' }],
      pageSize: AREA_OCCUPANCY_PAGE_SIZE,
      refetchInterval: OCCUPANCY_POLL_MS,
      filters: { pinned: ['area_id'], fields: ['area_id', 'facility_id', 'identity_id', 'entered_at'] },
    },
    show: {
      header: (l) => [l.grid(['area_id', 'entered_at', 'last_seen_at'])],
      body: (l) => [l.grid(['identity_id', 'facility_id', 'session_id']), 'created_at'],
    },
  },
});
