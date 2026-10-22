import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { INCIDENT_ACTIVITY_RESOURCE, INCIDENT_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { INCIDENT_ACTIVITY_KINDS, INCIDENT_ACTIVITY_KIND_ENUM } from '../../enums/incidents';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { incidentActivityDetails } from '../../fields/incident-activity-details';

/** Page size of an incident's timeline. */
export const INCIDENT_ACTIVITY_PAGE_SIZE = 50;

/** The timeline's columns on the incident's Activity tab. */
export const INCIDENT_ACTIVITY_COLUMNS = ['occurred_at', 'kind', 'details', 'actor_id'] as const;

/** Columns of `itap.incident_activities` the `org_admin` role reads; written by the platform only. */
export const incidentActivityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    system: true,
    in: ['show'],
    open: 'page',
    providerOptions: { relationship: 'incident' },
    texts: { label: 'Incident', doc: { summary: 'The incident the step belongs to.' } },
  }),
  occurred_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'When', doc: { summary: 'When it happened (an escalation by the policy carries its scheduled time).' } },
  }),
  kind: enumField(INCIDENT_ACTIVITY_KINDS, INCIDENT_ACTIVITY_KIND_ENUM, {
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Activity', doc: { summary: 'What happened to the incident.' } },
  }),
  details: incidentActivityDetails({
    kindField: 'kind',
    in: ['list', 'show'],
    texts: {
      label: 'Details',
      doc: {
        summary:
          'The step in one line: the status change with the disposition, the escalation step and reason, the report generated.',
      },
    },
  }),
  actor_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'none',
    texts: {
      label: 'By',
      doc: { summary: 'The member who did it; empty for the platform (an event rule, the escalation policy).' },
    },
  }),
};

/**
 * The timeline of an incident (`itap.incident_activities`): every status change, assignment,
 * escalation, note and report, written by the database's triggers and functions as they happen,
 * never by the console. An append-only log (keyset paging, no count on every page), read on the
 * incident's Activity tab only.
 */
export const incidentActivity = defineResource(INCIDENT_ACTIVITY_RESOURCE, {
  texts: {
    label: 'Incident activity',
    labelPlural: 'Incident activity',
    doc: {
      summary:
        'One step in an incident’s history: who changed its status, assigned, escalated or noted it, and when. Recorded by the platform, never edited.',
    },
  },
  basePath: '/incident-activities',
  displayField: 'kind',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: incidentActivityFields,
  views: {
    list: {
      page: false,
      columns: [...INCIDENT_ACTIVITY_COLUMNS],
      defaultSort: [{ field: 'occurred_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: INCIDENT_ACTIVITY_PAGE_SIZE,
    },
    show: { page: false },
  },
});
