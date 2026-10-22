import { ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { AREA_RESOURCE, EVENT_RULE_RESOURCE, FACILITY_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, INCIDENT_STATUSES, INCIDENT_STATUS_ENUM } from '../../enums/events';
import { INCIDENT_DISPOSITIONS, INCIDENT_DISPOSITION_ENUM } from '../../enums/incidents';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { platformRelation } from './place-fields';

const shown = ['list', 'show'] as const;

/** A member column the platform stamps (who acknowledged, resolved, opened): the account's name. */
const memberStamp = (label: string, summary: string) =>
  f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label, doc: { summary } },
  });

/**
 * Columns of `itap.incidents` the `org_admin` role reads. Title, description, severity, place,
 * assignee and external reference are written by a person (while the incident is not closed);
 * status, disposition, resolution, acknowledgement and escalation change only through the
 * lifecycle steps (`./incident-flows.ts`).
 */
export const incidentFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    system: true,
    in: [...shown],
    texts: { label: 'Code', doc: { summary: 'The incident’s number in the organization (INCIDENT-00012).' } },
  }),
  title: f.string({
    required: true,
    texts: { label: 'Title', doc: { summary: 'What happened, in one line; a rule’s incident takes the event’s title.' } },
  }),
  description: f.text({ nullable: true, in: ['show', 'create', 'edit'], texts: 'Description' }),
  severity: enumField(EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, {
    required: true,
    default: 'medium',
    texts: {
      label: 'Severity',
      doc: { summary: 'How urgent the incident is; an incident opened by a rule takes the event’s severity.' },
    },
  }),
  status: enumField(INCIDENT_STATUSES, INCIDENT_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Open, acknowledged, investigating, resolved or closed; changed only by the lifecycle steps (Acknowledge, Start investigation, Resolve, Close).',
      },
    },
  }),
  disposition: enumField(INCIDENT_DISPOSITIONS, INCIDENT_DISPOSITION_ENUM, {
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Disposition',
      doc: { summary: 'What it turned out to be, chosen when it is resolved; cleared when it is reopened.' },
    },
  }),
  resolution: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Resolution', doc: { summary: 'How it was settled, written when it is resolved.' } },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    nullable: true,
    open: 'page',
    providerOptions: { relationship: 'facility' },
    texts: { label: 'Facility', doc: { summary: 'The facility it happened in.' } },
  }),
  area_id: f.relation({
    to: AREA_RESOURCE,
    nullable: true,
    open: 'page',
    candidates: [{ field: 'facility_id', op: 'eq', value: ref('values', 'facility_id') }],
    providerOptions: { relationship: 'area' },
    texts: { label: 'Area', doc: { summary: 'The area it happened in; an area of the chosen facility.' } },
  }),
  assigned_to: f.relation({
    to: USER_RESOURCE,
    nullable: true,
    open: 'none',
    texts: {
      label: 'Assignee',
      doc: {
        summary:
          'The member handling it; an active member of the organization. Every change is recorded in the activity timeline.',
      },
    },
  }),
  assigned_to_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'Assigned to me', doc: { summary: 'Whether you are the incident’s assignee (the "Mine" view).' } },
  }),
  external_ref: f.string({
    nullable: true,
    in: ['show', 'create', 'edit'],
    texts: {
      label: 'External reference',
      doc: { summary: 'The case number in another system (a ticket, a police report), when there is one.' },
    },
  }),
  rule_id: platformRelation(EVENT_RULE_RESOURCE, null, {
    label: 'Opened by rule',
    summary:
      'The event rule whose version opened the incident (one incident per stay and rule); empty for an incident opened by hand.',
  }),
  escalation_policy_id: f.uuid({
    nullable: true,
    write: 'never',
    in: ['show'],
    texts: {
      label: 'Escalation policy',
      doc: {
        summary:
          'Copied from the rule version that opened it: who is notified, step by step, while nobody acknowledges it. Escalation policies come with the notification pages.',
      },
    },
  }),
  escalation_step: f.number({
    system: true,
    in: ['show'],
    texts: {
      label: 'Escalation step',
      doc: { summary: 'How many times it was escalated (by the policy or by "Escalate"); 0 when never.' },
    },
  }),
  last_escalated_at: dateTime({
    system: true,
    in: ['show'],
    texts: { label: 'Last escalated', doc: { summary: 'When it was last escalated.' } },
  }),
  created_at: dateTime({ system: true, in: [...shown], texts: { label: 'Opened', doc: { summary: 'When the incident was opened.' } } }),
  created_by: memberStamp('Opened by', 'The member who opened it by hand; empty for an incident opened by a rule.'),
  acknowledged_at: dateTime({
    system: true,
    in: ['show'],
    texts: {
      label: 'Acknowledged',
      doc: {
        summary:
          'When an operator took it on (also set by starting an investigation or resolving); empty while unacknowledged. Escalation stops then.',
      },
    },
  }),
  acknowledged_by: memberStamp('Acknowledged by', 'The member who took it on first.'),
  resolved_at: dateTime({ system: true, in: ['show'], texts: { label: 'Resolved', doc: { summary: 'When it was resolved.' } } }),
  resolved_by: memberStamp('Resolved by', 'The member who resolved it.'),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
