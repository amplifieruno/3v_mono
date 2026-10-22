import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { EVENT_RESOURCE, INCIDENT_EVENT_HISTORY_RESOURCE } from '../../data/resource-names';
import { severitiesFrom } from '../../enums/events';
import { eventFields } from './event-fields';

/** How often the event lists read again while open, in milliseconds. */
export const EVENT_POLL_MS = 15_000;

/** Page size of the event lists. */
export const EVENT_PAGE_SIZE = 50;

/** The columns of the event lists, on the list page and on the places' and people's tabs. */
export const EVENT_COLUMNS = [
  'occurred_at',
  'severity',
  'event_type',
  'title',
  'area_id',
  'profile_id',
  'device_id',
] as const;

/** Saved views of the event list, by severity (the scale is ordered) and by origin. */
export const EVENT_SAVED_VIEWS = [
  {
    id: 'critical',
    texts: 'Critical',
    state: { filters: [{ field: 'severity', op: 'eq', value: 'critical' }] },
  },
  {
    id: 'high-and-above',
    texts: 'High and above',
    state: { filters: [{ field: 'severity', op: 'in', value: severitiesFrom('high') }] },
  },
  {
    id: 'medium-and-above',
    texts: 'Medium and above',
    state: { filters: [{ field: 'severity', op: 'in', value: severitiesFrom('medium') }] },
  },
  {
    id: 'rule-matches',
    texts: 'Matched by a rule',
    state: { filters: [{ field: 'rule_version_id', op: 'isNotNull' }] },
  },
];

/**
 * Events (`itap.events`): state changes the platform noticed (an arrival, a watch-list match, a
 * denied door, a device going offline), newest first. Written by the platform only, an
 * append-only log: no create, edit or delete and no count on every page (the mapping's
 * `noAggregate`, `count: 'manual'`). Operators watch it, so it polls; buro ignores polling on a
 * cursor list (accumulated pages), hence offset paging here, unlike the other logs. The sidebar
 * facility narrows it; an event with no facility (a device or system event) shows under every
 * facility (`empty: 'shared'`).
 */
export const event = defineResource(EVENT_RESOURCE, {
  texts: {
    label: 'Event',
    labelPlural: 'Events',
    doc: {
      summary:
        'Something the platform noticed in a building or on a device: who, where, how urgent, and the rule version that matched it.',
    },
  },
  basePath: '/events',
  section: NAV_SECTIONS.monitoring,
  order: 2,
  icon: NAV_ICONS.events,
  displayField: 'title',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: eventFields,
  views: {
    list: {
      columns: [...EVENT_COLUMNS],
      optionalColumns: ['facility_id', 'identity_id', 'rule_version_id'],
      defaultSort: [{ field: 'occurred_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      count: 'manual',
      pageSize: EVENT_PAGE_SIZE,
      refetchInterval: EVENT_POLL_MS,
      search: { fields: [{ field: 'title', op: 'contains' }] },
      filters: {
        pinned: ['severity', 'event_type', 'facility_id', 'occurred_at'],
        fields: [
          'severity',
          'event_type',
          'facility_id',
          'area_id',
          'device_id',
          'identity_id',
          'profile_id',
          'rule_version_id',
          'occurred_at',
        ],
      },
      savedViews: EVENT_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['severity', 'event_type', 'occurred_at'])],
      body: (l) => [
        'title',
        l.panel([l.grid(['facility_id', 'area_id', 'access_point_id', 'device_id'])], { key: 'place', texts: 'Place' }),
        l.panel([l.grid(['identity_id', 'profile_id', 'session_id', 'detection_id'])], { key: 'person', texts: 'Person' }),
        l.panel(
          [l.grid(['rule_version_id', 'access_decision_id', 'authentication_attempt_id']), 'payload', 'dedup_key'],
          { key: 'origin', texts: 'Origin' },
        ),
        'created_at',
        l.panel(
          [
            l.place(relatedList(resourceByName(INCIDENT_EVENT_HISTORY_RESOURCE)), {
              key: 'event-incidents',
              props: {
                where: [{ field: 'event_id', op: 'eq', value: l.ref('record', 'id') }],
                columns: ['incident_id', 'created_at'],
                open: 'none',
              },
            }),
          ],
          { key: 'incidents', texts: 'Incidents' },
        ),
      ],
    },
  },
});
