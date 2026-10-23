import { type Rule, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { incidentHoldNotice } from '../compliance/hold-notice';
import {
  INCIDENT_ACTIVITY_RESOURCE,
  INCIDENT_EVENT_HISTORY_RESOURCE,
  INCIDENT_EVENT_RESOURCE,
  INCIDENT_IDENTITY_HISTORY_RESOURCE,
  INCIDENT_IDENTITY_RESOURCE,
  INCIDENT_NOTE_HISTORY_RESOURCE,
  INCIDENT_NOTE_RESOURCE,
  INCIDENT_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  REPORT_RESOURCE,
} from '../../data/resource-names';
import { severitiesFrom } from '../../enums/events';
import { INCIDENT_ACTIVITY_COLUMNS } from './incident-activity';
import { incidentFields } from './incident-fields';
import {
  ACTIVE_STATUSES,
  acknowledgeFlow,
  closeFlow,
  escalateFlow,
  generateReportFlow,
  reopenFlow,
  resolveFlow,
  startInvestigationFlow,
} from './incident-flows';
import { INCIDENT_NOTE_COLUMNS } from './incident-notes';

export { incidentFields };

/** The columns of an incident's Notifications tab: who was told or paged about it, and how it went. */
const DELIVERY_TAB_COLUMNS = ['created_at', 'origin', 'recipient_user_id', 'recipient_address', 'channel', 'status'] as const;

/** How often the incident list reads again while open, in milliseconds. */
export const INCIDENT_POLL_MS = 15_000;

/** The columns of the incident lists (the list page, a rule's and a person's Incidents tabs). */
export const INCIDENT_COLUMNS = ['code', 'title', 'severity', 'status', 'assigned_to', 'facility_id', 'created_at'] as const;

/** Saved views of the incident list: what operators look at first. */
export const INCIDENT_SAVED_VIEWS = [
  {
    id: 'open',
    texts: 'Open',
    state: { filters: [{ field: 'status', op: 'in', value: [...ACTIVE_STATUSES] }] },
  },
  {
    id: 'unacknowledged',
    texts: 'Unacknowledged',
    state: { filters: [{ field: 'acknowledged_at', op: 'isNull' }] },
  },
  {
    id: 'mine',
    texts: 'Mine',
    state: {
      filters: [
        { field: 'assigned_to_me', op: 'eq', value: true },
        { field: 'status', op: 'in', value: [...ACTIVE_STATUSES] },
      ],
    },
  },
  {
    id: 'critical',
    texts: 'Critical',
    state: {
      filters: [
        { field: 'severity', op: 'in', value: severitiesFrom('critical') },
        { field: 'status', op: 'in', value: [...ACTIVE_STATUSES] },
      ],
    },
  },
];

/** A closed incident is final: the database refuses any change (`status <> closed` on update). */
const INCIDENT_RULES: Rule[] = [
  {
    target: { kind: 'action', name: 'edit' },
    deny: 'run',
    when: (ctx) => (ctx.record as { readonly status?: unknown } | undefined)?.status === 'closed',
    fallback: 'disable',
    reason: 'The incident is closed: nothing about it changes any more.',
  },
];

/**
 * Incidents (`itap.incidents`): situations an operator has to handle, opened by event rules
 * (`creates_incident`) or by hand, followed from open to closed by the lifecycle steps
 * (`./incident-flows.ts`), each recorded in the activity timeline by the database. Operators watch
 * the list, so it polls; the sidebar facility narrows it, and an incident with no facility shows
 * under every facility (`empty: 'shared'`). An incident is history: never deleted.
 */
export const incident = defineResource(INCIDENT_RESOURCE, {
  texts: {
    label: 'Incident',
    labelPlural: 'Incidents',
    doc: {
      summary:
        'A situation an operator has to handle, opened by an event rule or by hand, followed from open to closed with notes, linked events and people, and a timeline of every step.',
    },
  },
  basePath: '/incidents',
  section: NAV_SECTIONS.monitoring,
  order: 3,
  icon: NAV_ICONS.incidents,
  displayField: 'code',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id', empty: 'shared' } } },
  prefill: { fromQuery: ['facility_id', 'area_id'] },
  operations: { delete: false },
  builtinActions: { delete: false },
  rules: INCIDENT_RULES,
  fields: incidentFields,
  actions: (r) => ({
    item: [
      r.action.flow('acknowledge', acknowledgeFlow),
      r.action.flow('start_investigation', startInvestigationFlow),
      r.action.flow('resolve', resolveFlow),
      r.action.flow('close', closeFlow),
      r.action.flow('reopen', reopenFlow),
      r.action.flow('escalate', escalateFlow),
      r.action.flow('generate_report', generateReportFlow),
    ],
  }),
  views: {
    list: {
      columns: [...INCIDENT_COLUMNS],
      optionalColumns: ['area_id', 'rule_id', 'disposition', 'acknowledged_at', 'escalation_step'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      refetchInterval: INCIDENT_POLL_MS,
      search: { fields: ['code', { field: 'title', op: 'contains' }] },
      filters: {
        pinned: ['status', 'severity', 'assigned_to'],
        fields: [
          'status',
          'severity',
          'assigned_to',
          'assigned_to_me',
          'disposition',
          'facility_id',
          'area_id',
          'rule_id',
          'acknowledged_at',
          'created_at',
        ],
      },
      savedViews: INCIDENT_SAVED_VIEWS,
    },
    show: {
      header: (l) => [l.grid(['code', 'status', 'severity', 'assigned_to'])],
      body: (l) => {
        const isClosed = l.in(l.ref('record', 'status'), ['closed']);
        const byIncident = [{ field: 'incident_id', op: 'eq', value: l.ref('record', 'id') }] as const;
        const linkTab = (key: string, texts: string, [open, frozen]: readonly [string, string], columns: readonly string[], rows: 'page' | 'none') =>
          l.panel(
            [
              l.panel(
                [l.place(relatedList(resourceByName(open)), { key: `${key}-open`, props: { where: [...byIncident], columns: [...columns], open: rows } })],
                { key: `${key}-editable`, when: l.not(isClosed) },
              ),
              l.panel(
                [l.place(relatedList(resourceByName(frozen)), { key: `${key}-frozen`, props: { where: [...byIncident], columns: [...columns], open: rows } })],
                { key: `${key}-closed`, when: isClosed },
              ),
            ],
            { key, texts },
          );
        return [
          incidentHoldNotice(l),
          l.tabs(
            [
              l.panel(
                [
                  'title',
                  'description',
                  l.grid(['facility_id', 'area_id', 'rule_id']),
                  l.grid(['created_at', 'created_by', 'external_ref']),
                  l.panel(
                    [
                      l.grid(['acknowledged_at', 'acknowledged_by']),
                      l.grid(['resolved_at', 'resolved_by', 'disposition']),
                      'resolution',
                    ],
                    { key: 'lifecycle', texts: 'Handling' },
                  ),
                  l.panel([l.grid(['escalation_policy_id', 'escalation_step', 'last_escalated_at'])], {
                    key: 'escalation',
                    texts: 'Escalation',
                  }),
                  'updated_at',
                ],
                { key: 'details', texts: 'Details' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(INCIDENT_ACTIVITY_RESOURCE)), {
                    key: 'incident-activity',
                    props: { where: [...byIncident], columns: [...INCIDENT_ACTIVITY_COLUMNS], open: 'none' },
                  }),
                ],
                { key: 'activity', texts: 'Activity' },
              ),
              linkTab('notes', 'Notes', [INCIDENT_NOTE_RESOURCE, INCIDENT_NOTE_HISTORY_RESOURCE], INCIDENT_NOTE_COLUMNS, 'page'),
              linkTab('events', 'Events', [INCIDENT_EVENT_RESOURCE, INCIDENT_EVENT_HISTORY_RESOURCE], ['event_id', 'created_at'], 'none'),
              linkTab(
                'people',
                'People',
                [INCIDENT_IDENTITY_RESOURCE, INCIDENT_IDENTITY_HISTORY_RESOURCE],
                ['identity_id', 'role', 'created_at'],
                'none',
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(NOTIFICATION_DELIVERY_RESOURCE)), {
                    key: 'incident-deliveries',
                    props: { where: [...byIncident], columns: [...DELIVERY_TAB_COLUMNS], open: 'page' },
                  }),
                ],
                { key: 'deliveries', texts: 'Notifications' },
              ),
              l.panel(
                [
                  l.place(relatedList(resourceByName(REPORT_RESOURCE)), {
                    key: 'incident-reports',
                    props: { where: [...byIncident], columns: ['code', 'format', 'status', 'created_at', 'generated_at'], open: 'page' },
                  }),
                ],
                { key: 'reports', texts: 'Reports' },
              ),
            ],
            { key: 'sections' },
          ),
        ];
      },
    },
    create: {
      body: (l) => [
        'title',
        l.grid(['severity', 'assigned_to']),
        'description',
        l.grid(['facility_id', 'area_id']),
        l.grid(['external_ref', 'escalation_policy_id']),
      ],
    },
    edit: {
      body: (l) => [
        'title',
        l.grid(['severity', 'assigned_to']),
        'description',
        l.grid(['facility_id', 'area_id']),
        l.grid(['external_ref', 'escalation_policy_id']),
      ],
    },
  },
});
