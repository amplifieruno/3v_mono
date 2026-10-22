import { f } from '@burojs/field-types';
import { EVENT_RULE_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, VERSION_STATUSES, VERSION_STATUS_ENUM } from '../../enums/events';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { eventRuleParameters } from '../../fields/event-rule-parameters';
import { versionRuleTypeField } from './event-rule-fields';

/**
 * Columns of `itap.event_rule_versions` the `org_admin` role reads. Severity, incident and
 * parameters are edited on an open (draft or pending) version; published and superseded versions
 * are frozen by the database. Versions are created by `create_event_rule_draft` only.
 */
export const eventRuleVersionFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  rule_id: f.relation({
    to: EVENT_RULE_RESOURCE,
    system: true,
    open: 'page',
    providerOptions: { relationship: 'rule' },
    texts: { label: 'Rule', doc: { summary: 'The event rule this is a version of.' } },
  }),
  version: f.number({
    system: true,
    texts: { label: 'Version', doc: { summary: 'The version’s number within its rule: 1, 2, 3 in the order they were drafted.' } },
  }),
  status: enumField(VERSION_STATUSES, VERSION_STATUS_ENUM, {
    system: true,
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Draft while edited; published when in force (one per rule); superseded once a later version was published. Changed only by publishing.',
      },
    },
  }),
  rule_type: versionRuleTypeField,
  parameters: eventRuleParameters({
    typeField: 'rule_type',
    texts: {
      label: 'Parameters',
      doc: {
        summary:
          'The thresholds of the rule type: the dwell time of an unusual-dwell rule, the watch-list kinds of a watch-list rule. The other types take theirs from the places and the organization settings.',
      },
    },
  }),
  severity: enumField(EVENT_SEVERITIES, EVENT_SEVERITY_ENUM, {
    required: true,
    texts: {
      label: 'Severity',
      doc: {
        summary:
          'The severity of the events this version matches; when several rules match an event, the most severe one decides it.',
      },
    },
  }),
  creates_incident: f.boolean({
    texts: {
      label: 'Opens an incident',
      doc: {
        summary:
          'Each match opens an incident for operators (one per person’s stay and rule; later matches are linked to it).',
      },
    },
  }),
  escalation_policy_id: f.uuid({
    nullable: true,
    write: 'never',
    in: ['show'],
    texts: {
      label: 'Escalation policy',
      doc: {
        summary:
          'Copied to the incidents this version opens. Chosen from the escalation policies, which the notifications pages add.',
      },
    },
  }),
  published_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['list', 'show'],
    open: 'none',
    texts: { label: 'Published by', doc: { summary: 'The member who put the version in force.' } },
  }),
  published_at: dateTime({
    system: true,
    in: ['list', 'show'],
    texts: { label: 'Published', doc: { summary: 'When the version was put in force; empty for a draft.' } },
  }),
  created_at: f.dateTime({ system: true, texts: 'Drafted', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
