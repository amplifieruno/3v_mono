import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { INCIDENT_RESOURCE } from '../../data/resource-names';
import {
  INCIDENT_DISPOSITIONS,
  INCIDENT_DISPOSITION_ENUM,
  REPORT_FORMATS,
  REPORT_FORMAT_ENUM,
} from '../../enums/incidents';
import { enumField } from '../../enums/field';
import {
  acknowledgeIncident,
  closeIncident,
  escalateIncident,
  generateIncidentReport,
  resolveIncident,
  startInvestigation,
} from './incident-ops';

/** The statuses an incident is still being handled in (escalation and resolving accept them). */
export const ACTIVE_STATUSES = ['open', 'acknowledged', 'investigating'] as const;

const status = ref('record', 'status');
export const IS_OPEN = cond.equals(status, 'open');
export const CAN_INVESTIGATE = cond.in(status, ['open', 'acknowledged']);
export const IS_ACTIVE = cond.in(status, [...ACTIVE_STATUSES]);
export const IS_RESOLVED = cond.equals(status, 'resolved');

type IncidentRow = Readonly<Record<string, unknown>>;

/**
 * Check again after a lost answer: reads the incident back; applied when `applied(now, before)`
 * holds for the incident now and as the flow saw it.
 */
export function incidentApplied(applied: (now: IncidentRow, before: IncidentRow) => boolean): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(INCIDENT_RESOURCE) as never, { id } as never);
      if (row === null || row === undefined) return 'unknown';
      return applied(row as IncidentRow, record as IncidentRow) ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}

const statusIs = (value: string) => incidentApplied((now) => now.status === value);
const input = { incidentId: ref('record', 'id') };
const surfaces = { default: 'menu', show: 'auto', row: 'menu' } as const;

/**
 * "Acknowledge" on an open incident: `acknowledge_incident` records who took it on and stops the
 * escalation. Idempotent in the database: on an incident someone else acknowledged meanwhile
 * (this page was stale), it answers the incident unchanged, so the message names the member who
 * did, the page reloads and the timeline gets no second entry (plan 05 Review Focus 1).
 */
export const acknowledgeFlow = {
  texts: {
    label: 'Acknowledge',
    notify: '{{code}} is acknowledged by {{by}}.',
    doc: { summary: 'Takes the incident on: escalation stops and the timeline records who acknowledged it and when.' },
  },
  icon: NAV_ICONS.acknowledge,
  surfaces,
  when: IS_OPEN,
  submit: {
    mutation: acknowledgeIncident,
    // Idempotent: a repeated call answers the acknowledged incident unchanged.
    retry: 'after-auth-refresh',
    input,
    onUnknown: { check: incidentApplied((now) => typeof now.acknowledged_at === 'string' && now.acknowledged_at !== '') },
  },
  then: { notify: { params: { code: ref('result', 'code'), by: ref('result', 'acknowledged_by_name') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Start investigation" on an open or acknowledged incident (acknowledging an open one on the way). */
export const startInvestigationFlow = {
  texts: {
    label: 'Start investigation',
    notify: 'Investigation started.',
    doc: { summary: 'Marks the incident as being investigated; an unacknowledged one is acknowledged at the same time.' },
  },
  icon: NAV_ICONS.investigate,
  surfaces,
  when: CAN_INVESTIGATE,
  submit: { mutation: startInvestigation, retry: 'never', input, onUnknown: { check: statusIs('investigating') } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Reopen investigation" on a resolved incident: back to investigating; the disposition and resolution are cleared. */
export const reopenFlow = {
  texts: {
    label: 'Reopen investigation',
    confirm: 'Reopen the investigation? The disposition and resolution are cleared (the timeline keeps them).',
    notify: 'Investigation reopened.',
    doc: {
      summary:
        'Takes a resolved incident back to investigating, for example when new facts appear; its disposition and resolution are cleared and stay in the timeline.',
    },
  },
  icon: NAV_ICONS.reopen,
  surfaces: { default: 'menu', show: 'menu', row: 'menu' },
  when: IS_RESOLVED,
  confirm: true,
  submit: { mutation: startInvestigation, retry: 'never', input, onUnknown: { check: statusIs('investigating') } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

const escalateFields = {
  reason: f.text({
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why it is escalated now; recorded in the timeline and sent with the escalation.' } },
  }),
};

/**
 * "Escalate" on an incident still being handled: the next step of its escalation policy is
 * notified now (or, without a policy, the step count goes up), with the reason in the timeline.
 */
export const escalateFlow = {
  texts: {
    label: 'Escalate',
    confirm: 'Escalate the incident to the next step now?',
    notify: 'Escalated.',
    doc: {
      summary:
        'Notifies the next step of the incident’s escalation policy now, without waiting for its delay; the timeline records the step and the reason.',
    },
  },
  icon: NAV_ICONS.escalate,
  surfaces: { default: 'menu', show: 'menu', row: 'menu' },
  when: IS_ACTIVE,
  confirm: true,
  form: { fields: escalateFields, initial: { reason: { kind: 'literal', value: null } } },
  submit: {
    mutation: escalateIncident,
    retry: 'never',
    input: { incidentId: ref('record', 'id'), reason: ref('values', 'reason') },
    onUnknown: {
      check: incidentApplied((now, before) => Number(now.escalation_step) > Number(before.escalation_step ?? 0)),
    },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof escalateFields>;

const resolveFields = {
  disposition: enumField(INCIDENT_DISPOSITIONS, INCIDENT_DISPOSITION_ENUM, {
    required: true,
    texts: {
      label: 'Disposition',
      doc: { summary: 'What the incident turned out to be: a real incident, a false alarm, harmless or a duplicate.' },
    },
  }),
  resolution: f.text({
    nullable: true,
    texts: { label: 'Resolution', doc: { summary: 'How it was settled; kept on the incident and in the timeline.' } },
  }),
};

/** "Resolve" on an incident still being handled: the disposition and resolution, then `resolve_incident`. */
export const resolveFlow = {
  texts: {
    label: 'Resolve',
    notify: 'Incident resolved.',
    doc: {
      summary:
        'Settles the incident with what it turned out to be and how it was handled; it can be closed afterwards, or reopened.',
    },
  },
  icon: NAV_ICONS.resolve,
  surfaces,
  when: IS_ACTIVE,
  form: { fields: resolveFields, initial: { resolution: { kind: 'literal', value: null } } },
  submit: {
    mutation: resolveIncident,
    retry: 'never',
    input: {
      incidentId: ref('record', 'id'),
      disposition: ref('values', 'disposition'),
      resolution: ref('values', 'resolution'),
    },
    onUnknown: { check: statusIs('resolved') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof resolveFields>;

/** "Close" on a resolved incident: final, nothing about it changes afterwards. */
export const closeFlow = {
  texts: {
    label: 'Close',
    confirm: 'Close the incident? A closed incident is final: its notes, links and details can no longer change.',
    notify: 'Incident closed.',
    doc: { summary: 'Ends a resolved incident for good: it, its notes and its links are frozen.' },
  },
  icon: NAV_ICONS.closeIncident,
  surfaces,
  when: IS_RESOLVED,
  confirm: true,
  submit: { mutation: closeIncident, retry: 'never', input, onUnknown: { check: statusIs('closed') } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

const reportFields = {
  format: enumField(REPORT_FORMATS, REPORT_FORMAT_ENUM, {
    required: true,
    default: 'pdf',
    texts: { label: 'Format', doc: { summary: 'The file the report is generated as.' } },
  }),
};

/**
 * "Generate incident report": `generate_incident_report` queues a report of the incident (its
 * timeline and notes), generated in the background; the timeline records it once it is ready.
 * The reports pages come with a later phase, so the message names the report's code.
 */
export const generateReportFlow = {
  texts: {
    label: 'Generate incident report',
    notify: 'Report {{code}} is queued. It is generated in the background and listed on the Reports pages (coming in a later release).',
    doc: {
      summary:
        'Queues a report of the incident with its timeline and notes, as PDF, Excel, CSV or JSON; the timeline records it once it is generated.',
    },
  },
  icon: NAV_ICONS.incidentReport,
  surfaces: { default: 'menu', show: 'menu', row: false },
  form: { fields: reportFields, initial: { format: { kind: 'literal', value: 'pdf' } } },
  submit: {
    mutation: generateIncidentReport,
    // Each call queues another report: never repeated on its own.
    retry: 'never',
    input: { incidentId: ref('record', 'id'), format: ref('values', 'format') },
  },
  then: { notify: { params: { code: ref('result', 'code') } } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof reportFields>;
