import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { EVENT_RULE_RESOURCE, INCIDENT_RESOURCE } from '../../data/resource-names';
import { INCIDENT_STATUSES, INCIDENT_STATUS_ENUM } from '../../enums/events';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { severityField } from './event-fields';
import { areaRelation, facilityRelation, platformRelation } from './place-fields';

const shown = ['list', 'show'] as const;

/**
 * Columns of `itap.incidents` read so far: what an event rule's page lists. The incident
 * workflow (assignment, lifecycle, notes, linked events and identities) is added by the
 * incidents task of this phase.
 */
export const incidentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The incident’s number in the organization (INCIDENT-00012).' } },
  }),
  title: f.string({ system: true, in: [...shown], texts: 'Title' }),
  severity: severityField('How urgent the incident is; an incident opened by a rule takes the event’s severity.'),
  status: enumField(INCIDENT_STATUSES, INCIDENT_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: { summary: 'Open, acknowledged, investigating, resolved or closed; changed only by the lifecycle steps.' },
    },
  }),
  facility_id: facilityRelation('The facility it happened in.'),
  area_id: areaRelation('The area it happened in.'),
  rule_id: platformRelation(EVENT_RULE_RESOURCE, null, {
    label: 'Opened by rule',
    summary:
      'The event rule whose version opened the incident (one incident per stay and rule); empty for an incident opened by hand.',
  }),
  created_at: dateTime({ system: true, in: [...shown], texts: { label: 'Opened', doc: { summary: 'When the incident was opened.' } } }),
  acknowledged_at: dateTime({
    system: true,
    in: ['show'],
    texts: { label: 'Acknowledged', doc: { summary: 'When an operator took it on; empty while unacknowledged.' } },
  }),
  resolved_at: dateTime({ system: true, in: ['show'], texts: { label: 'Resolved', doc: { summary: 'When it was resolved.' } } }),
};

/**
 * Incidents (`itap.incidents`): situations an operator has to handle, opened by event rules
 * (`creates_incident`) or by hand. Read-only here; the lifecycle comes with the incidents task.
 */
export const incident = defineResource(INCIDENT_RESOURCE, {
  texts: {
    label: 'Incident',
    labelPlural: 'Incidents',
    doc: {
      summary:
        'A situation an operator has to handle, opened by an event rule or by hand, followed from open to closed.',
    },
  },
  basePath: '/incidents',
  section: NAV_SECTIONS.monitoring,
  order: 3,
  icon: NAV_ICONS.incidents,
  displayField: 'code',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: incidentFields,
  views: {
    list: {
      columns: ['code', 'title', 'severity', 'status', 'facility_id', 'rule_id', 'created_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      search: { fields: ['code', { field: 'title', op: 'contains' }] },
      filters: { pinned: ['status', 'severity'], fields: ['status', 'severity', 'facility_id', 'area_id', 'rule_id', 'created_at'] },
    },
    show: {
      header: (l) => [l.grid(['code', 'status', 'severity', 'created_at'])],
      body: (l) => ['title', l.grid(['facility_id', 'area_id', 'rule_id']), l.grid(['acknowledged_at', 'resolved_at'])],
    },
  },
});
