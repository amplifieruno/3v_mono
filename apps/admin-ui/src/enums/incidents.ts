import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Incident enums (dispositions, timeline kinds, people's roles, report formats); values are the rows of the Hasura enum tables in `INCIDENT_ENUM_TABLES`. */

export const INCIDENT_DISPOSITION_ENUM = 'incident_disposition';
export const INCIDENT_ACTIVITY_KIND_ENUM = 'incident_activity_kind';
export const INCIDENT_IDENTITY_ROLE_ENUM = 'incident_identity_role';
export const REPORT_FORMAT_ENUM = 'report_format';

export const INCIDENT_DISPOSITIONS = ['true_positive', 'false_positive', 'benign', 'duplicate'] as const;
export const INCIDENT_ACTIVITY_KINDS = [
  'status_change',
  'assigned',
  'escalated',
  'notified',
  'action_taken',
  'note',
  'report_generated',
] as const;
export const INCIDENT_IDENTITY_ROLES = ['subject', 'witness', 'related'] as const;
export const REPORT_FORMATS = ['pdf', 'xlsx', 'csv', 'json'] as const;

export const incidentDispositionEnum = defineEnum({
  name: INCIDENT_DISPOSITION_ENUM,
  values: enumValues(INCIDENT_DISPOSITIONS, {
    true_positive: 'destructive',
    false_positive: 'secondary',
    benign: 'success',
    duplicate: 'outline',
  }),
  texts: {
    true_positive: { label: 'Real incident', doc: { summary: 'It happened and mattered.' } },
    false_positive: { label: 'False alarm', doc: { summary: 'Nothing happened: the rule or the recognition was wrong.' } },
    benign: { label: 'Harmless', doc: { summary: 'It happened, but it was harmless (an expected visitor, a drill).' } },
    duplicate: { label: 'Duplicate', doc: { summary: 'Another incident already covers it.' } },
  },
});

export const incidentActivityKindEnum = defineEnum({
  name: INCIDENT_ACTIVITY_KIND_ENUM,
  values: enumValues(INCIDENT_ACTIVITY_KINDS, {
    status_change: 'info',
    assigned: 'secondary',
    escalated: 'warning',
    notified: 'outline',
    action_taken: 'secondary',
    note: 'outline',
    report_generated: 'success',
  }),
  texts: {
    status_change: { label: 'Status changed', doc: { summary: 'Opened, acknowledged, investigated, resolved, reopened or closed.' } },
    assigned: { label: 'Assignee changed', doc: { summary: 'The incident was assigned to someone else.' } },
    escalated: { label: 'Escalated', doc: { summary: 'Escalated to the next step, by an operator or by the escalation policy.' } },
    notified: { label: 'Notified', doc: { summary: 'A notification about it was sent.' } },
    action_taken: { label: 'Action taken', doc: { summary: 'An action was taken on it.' } },
    note: { label: 'Note added', doc: { summary: 'An operator added a note.' } },
    report_generated: { label: 'Report generated', doc: { summary: 'An incident report was generated.' } },
  },
});

export const incidentIdentityRoleEnum = defineEnum({
  name: INCIDENT_IDENTITY_ROLE_ENUM,
  values: enumValues(INCIDENT_IDENTITY_ROLES, { subject: 'warning', witness: 'info', related: 'outline' }),
  texts: {
    subject: { label: 'Subject', doc: { summary: 'The person the incident is about.' } },
    witness: { label: 'Witness', doc: { summary: 'A person who saw what happened.' } },
    related: { label: 'Related', doc: { summary: 'A person otherwise involved.' } },
  },
});

export const reportFormatEnum = defineEnum({
  name: REPORT_FORMAT_ENUM,
  values: enumValues(REPORT_FORMATS, { pdf: 'secondary', xlsx: 'secondary', csv: 'secondary', json: 'secondary' }),
  texts: {
    pdf: { label: 'PDF', doc: { summary: 'A document to read or print.' } },
    xlsx: { label: 'Excel', doc: { summary: 'An Excel workbook.' } },
    csv: { label: 'CSV', doc: { summary: 'Comma-separated values.' } },
    json: { label: 'JSON', doc: { summary: 'Machine-readable data.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const INCIDENT_ENUM_TABLES: Readonly<Record<string, string>> = {
  [INCIDENT_DISPOSITION_ENUM]: 'incident_dispositions',
  [INCIDENT_ACTIVITY_KIND_ENUM]: 'incident_activity_kinds',
  [INCIDENT_IDENTITY_ROLE_ENUM]: 'incident_identity_roles',
  [REPORT_FORMAT_ENUM]: 'report_formats',
};
