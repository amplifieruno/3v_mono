import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { recordDate } from '../people/record-date';
import { resourceByName } from '../../data/resource-by-name';
import { IDENTITY_LOCATION_RESOURCE, TRACKING_SESSION_RESOURCE } from '../../data/resource-names';
import { trackingSessionFields } from './tracking-session-fields';

/** Page size of the session lists. */
export const TRACKING_SESSION_PAGE_SIZE = 25;

/** The columns of the session lists, on the list page and on the people's tabs. */
export const TRACKING_SESSION_COLUMNS = [
  'started_at',
  'identity_id',
  'profile_id',
  'facility_id',
  'status',
  'last_area_id',
  'last_detected_at',
  'duration_seconds',
] as const;

/** The columns of a session's path. */
export const PATH_COLUMNS = ['occurred_at', 'movement_type', 'area_id', 'access_point_id', 'device_id'] as const;

/**
 * Tracking sessions (`itap.tracking_sessions`): one visit of a person to a facility, from the
 * first detection to the last, with its path (the identity's locations of the session). Written
 * by the tracking pipeline only; newest first, keyset paging, no count on every page.
 */
export const trackingSession = defineResource(TRACKING_SESSION_RESOURCE, {
  texts: {
    label: 'Tracking session',
    labelPlural: 'Tracking sessions',
    doc: {
      summary:
        'One stay of a person in a facility as the cameras followed it: arrival, the areas passed through in order, the last place seen and how it ended.',
    },
  },
  basePath: '/tracking-sessions',
  section: NAV_SECTIONS.monitoring,
  order: 20,
  icon: NAV_ICONS.trackingSessions,
  displayField: 'started_at',
  recordTitle: (record) => recordDate('Session from', record.started_at),
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: trackingSessionFields,
  views: {
    list: {
      columns: [...TRACKING_SESSION_COLUMNS],
      optionalColumns: ['ended_at'],
      defaultSort: [{ field: 'started_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: TRACKING_SESSION_PAGE_SIZE,
      filters: {
        pinned: ['status', 'facility_id', 'started_at'],
        fields: ['status', 'facility_id', 'last_area_id', 'identity_id', 'profile_id', 'visit_id', 'started_at', 'ended_at'],
      },
      savedViews: [
        { id: 'active', texts: 'Active now', state: { filters: [{ field: 'status', op: 'eq', value: 'active' }] } },
        { id: 'lost', texts: 'Lost from sight', state: { filters: [{ field: 'status', op: 'eq', value: 'lost' }] } },
        { id: 'visits', texts: 'With a visit', state: { filters: [{ field: 'visit_id', op: 'isNotNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['status', 'started_at', 'last_detected_at', 'ended_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['identity_id', 'profile_id', 'visit_id']),
                l.grid(['facility_id', 'last_area_id', 'last_access_point_id']),
                l.grid(['duration_seconds', 'created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(IDENTITY_LOCATION_RESOURCE)), {
                  key: 'session-path',
                  props: {
                    where: [{ field: 'session_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: [...PATH_COLUMNS],
                    open: 'page',
                  },
                }),
              ],
              { key: 'path', texts: 'Path' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
  },
});
