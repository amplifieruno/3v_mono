import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Integrations and exports (slice 10); values are the rows of the Hasura enum tables in
 * `INTEGRATION_ENUM_TABLES`, except the sync run status and the job trigger (CHECK constraints).
 */

export const INTEGRATION_KIND_ENUM = 'integration_kind';
export const INTEGRATION_STATUS_ENUM = 'integration_status';
export const INTEGRATION_DIRECTION_ENUM = 'integration_direction';
export const SYNC_RUN_STATUS_ENUM = 'integration_sync_status';
export const JOB_TRIGGER_ENUM = 'compliance_job_trigger';
export const EXPORT_ENTITY_ENUM = 'export_entity';
export const EXPORT_FORMAT_ENUM = 'export_format';
export const EXPORT_MODE_ENUM = 'export_mode';
export const EXPORT_JOB_STATUS_ENUM = 'export_job_status';

export const INTEGRATION_KINDS = ['hr', 'erp', 'siem', 'bms', 'webhook', 'custom'] as const;
export const INTEGRATION_STATUSES = ['active', 'paused', 'error'] as const;
export const INTEGRATION_DIRECTIONS = ['inbound', 'outbound', 'both'] as const;
export const SYNC_RUN_STATUSES = ['running', 'succeeded', 'failed'] as const;
export const JOB_TRIGGERS = ['manual', 'schedule'] as const;
export const EXPORT_ENTITIES = [
  'profiles',
  'identities',
  'events',
  'incidents',
  'visits',
  'access_decisions',
  'detections',
  'authentication_attempts',
  'audit_log',
] as const;
export const EXPORT_FORMATS = ['csv', 'json', 'xlsx'] as const;
export const EXPORT_MODES = ['full', 'incremental'] as const;
export const EXPORT_JOB_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
/** Job statuses the background job still moves on from by itself. */
export const OPEN_JOB_STATUSES: ReadonlySet<string> = new Set(['queued', 'running']);

const text = (label: string, summary: string) => ({ label, doc: { summary } });

export const integrationKindEnum = defineEnum({
  name: INTEGRATION_KIND_ENUM,
  values: enumValues(INTEGRATION_KINDS, { hr: 'info', erp: 'secondary', siem: 'warning', bms: 'secondary', webhook: 'secondary', custom: 'secondary' }),
  texts: {
    hr: text('HR system', 'Imports people as profiles. In this demo the HR sync applies a fixture file (CSV or JSON) through the field mapping, for real.'),
    erp: text('ERP', 'Companies and cost centres from an ERP. Kept as a record; no sync is implemented.'),
    siem: text('SIEM', 'Sends security events to a SIEM. A stub in this demo: a sync counts the events since the last one and sends nothing.'),
    bms: text('Building management', 'Sends occupancy to a building management system. A stub in this demo: a sync counts the occupancy rows and sends nothing.'),
    webhook: text('Webhook', 'A generic outbound connector. A stub in this demo: a sync counts the events and sends nothing.'),
    custom: text('Custom', 'Any other connector, kept as a record with its settings.'),
  },
});

export const integrationStatusEnum = defineEnum({
  name: INTEGRATION_STATUS_ENUM,
  values: enumValues(INTEGRATION_STATUSES, { active: 'success', paused: 'secondary', error: 'destructive' }),
  texts: {
    active: text('Active', 'Syncs run by hand and on the schedule.'),
    paused: text('Paused', 'Switched off by an administrator: no sync runs, by hand or on the schedule, until it is active again.'),
    error: text('Error', 'The last sync failed (set by the platform only). The next successful sync makes it active again.'),
  },
});

export const integrationDirectionEnum = defineEnum({
  name: INTEGRATION_DIRECTION_ENUM,
  values: enumValues(INTEGRATION_DIRECTIONS, { inbound: 'info', outbound: 'secondary', both: 'secondary' }),
  texts: {
    inbound: text('Inbound', 'Data flows into ITAP (an HR feed creating profiles).'),
    outbound: text('Outbound', 'Data flows out of ITAP (events to a SIEM, occupancy to a building system).'),
    both: text('Both directions', 'Data flows in and out.'),
  },
});

export const syncRunStatusEnum = defineEnum({
  name: SYNC_RUN_STATUS_ENUM,
  values: enumValues(SYNC_RUN_STATUSES, { running: 'info', succeeded: 'success', failed: 'destructive' }),
  texts: {
    running: text('Running', 'The background job is applying the sync; it ends within seconds to minutes.'),
    succeeded: text('Succeeded', 'The sync finished; its counts say what it read and wrote.'),
    failed: text('Failed', 'The sync stopped with an error; the integration is set to error until a sync succeeds.'),
  },
});

export const jobTriggerEnum = defineEnum({
  name: JOB_TRIGGER_ENUM,
  values: enumValues(JOB_TRIGGERS, { manual: 'secondary', schedule: 'info' }),
  texts: {
    manual: text('By hand', 'Started by a member (Run sync, Run now).'),
    schedule: text('Schedule', 'Started by the schedule (checked every 15 minutes).'),
  },
});

export const exportEntityEnum = defineEnum({
  name: EXPORT_ENTITY_ENUM,
  values: enumValues(EXPORT_ENTITIES, {
    profiles: 'secondary',
    identities: 'secondary',
    events: 'secondary',
    incidents: 'secondary',
    visits: 'secondary',
    access_decisions: 'secondary',
    detections: 'secondary',
    authentication_attempts: 'secondary',
    audit_log: 'secondary',
  }),
  texts: {
    profiles: text('Profiles', 'The people of the organization.'),
    identities: text('Identities', 'Every tracked identity, known or unknown.'),
    events: text('Events', 'Events raised by the rules and the platform.'),
    incidents: text('Incidents', 'Incidents with their status and severity.'),
    visits: text('Visits', 'Visitor visits.'),
    access_decisions: text('Access decisions', 'What the doors decided about whom.'),
    detections: text('Detections', 'Faces the cameras detected, of the last 31 days only.'),
    authentication_attempts: text('Face authentication attempts', 'Attempts of the face authentication service.'),
    audit_log: text('Audit log', 'Who changed what, and when.'),
  },
});

export const exportFormatEnum = defineEnum({
  name: EXPORT_FORMAT_ENUM,
  values: enumValues(EXPORT_FORMATS, { csv: 'secondary', json: 'secondary', xlsx: 'secondary' }),
  texts: {
    csv: text('CSV', 'Comma-separated values, one row per record.'),
    json: text('JSON', 'A JSON document with an array of records.'),
    xlsx: text('Excel', 'An Excel workbook (XLSX), one row per record.'),
  },
});

export const exportModeEnum = defineEnum({
  name: EXPORT_MODE_ENUM,
  values: enumValues(EXPORT_MODES, { full: 'secondary', incremental: 'info' }),
  texts: {
    full: text('Full', 'Every matching row, each run (up to the row limit).'),
    incremental: text('Incremental', 'Only rows created since the last completed run (a cursor kept by the definition).'),
  },
});

export const exportJobStatusEnum = defineEnum({
  name: EXPORT_JOB_STATUS_ENUM,
  values: enumValues(EXPORT_JOB_STATUSES, { queued: 'secondary', running: 'info', completed: 'success', failed: 'destructive' }),
  texts: {
    queued: text('Queued', 'Waiting for the background job, which picks it up within seconds.'),
    running: text('Running', 'The file is being written.'),
    completed: text('Completed', 'The file is ready for its owner.'),
    failed: text('Failed', 'No file was written; the error says why.'),
  },
});

export const INTEGRATION_ENUMS = [
  integrationKindEnum,
  integrationStatusEnum,
  integrationDirectionEnum,
  syncRunStatusEnum,
  jobTriggerEnum,
  exportEntityEnum,
  exportFormatEnum,
  exportModeEnum,
  exportJobStatusEnum,
] as const;

/** Enums with no Hasura enum table (CHECK constraints). */
export const INTEGRATION_CONSOLE_ONLY_ENUMS = [SYNC_RUN_STATUS_ENUM, JOB_TRIGGER_ENUM] as const;

export const INTEGRATION_ENUM_TABLES: Readonly<Record<string, string>> = {
  [INTEGRATION_KIND_ENUM]: 'integration_kinds',
  [INTEGRATION_STATUS_ENUM]: 'integration_statuses',
  [INTEGRATION_DIRECTION_ENUM]: 'integration_directions',
  [EXPORT_ENTITY_ENUM]: 'export_entities',
  [EXPORT_FORMAT_ENUM]: 'export_formats',
  [EXPORT_MODE_ENUM]: 'export_modes',
  [EXPORT_JOB_STATUS_ENUM]: 'export_job_statuses',
};
