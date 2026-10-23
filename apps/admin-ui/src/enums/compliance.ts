import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Compliance enums (retention); values are the rows of the Hasura enum tables in `COMPLIANCE_ENUM_TABLES`. */

export const RETENTION_DATA_CLASS_ENUM = 'retention_data_class';
export const RETENTION_ACTION_ENUM = 'retention_action';
export const RETENTION_RUN_STATUS_ENUM = 'retention_run_status';

/** The 21 data classes, in the order the nightly run purges them (`itap.retention_class_order`). */
export const RETENTION_DATA_CLASSES = [
  'access_decisions',
  'auth_evidence',
  'auth_attempts',
  'deliveries',
  'webhook_deliveries',
  'reports',
  'incidents',
  'events',
  'detections',
  'locations',
  'sessions',
  'search_history',
  'bulk_jobs',
  'export_jobs',
  'integration_sync_runs',
  'terminal_syncs',
  'stats',
  'photos',
  'embeddings_withdrawn',
  'unknown_identities',
  'audit',
] as const;
export type RetentionDataClass = (typeof RETENTION_DATA_CLASSES)[number];

export const RETENTION_ACTIONS = ['delete', 'anonymize', 'archive'] as const;
export type RetentionAction = (typeof RETENTION_ACTIONS)[number];

export const RETENTION_RUN_STATUSES = ['running', 'completed', 'failed', 'interrupted'] as const;

const cls = (label: string, summary: string) => ({ label, doc: { summary } });

export const retentionDataClassEnum = defineEnum({
  name: RETENTION_DATA_CLASS_ENUM,
  values: enumValues(RETENTION_DATA_CLASSES, {
    access_decisions: 'secondary',
    auth_evidence: 'secondary',
    auth_attempts: 'secondary',
    deliveries: 'secondary',
    webhook_deliveries: 'secondary',
    reports: 'secondary',
    incidents: 'secondary',
    events: 'secondary',
    detections: 'secondary',
    locations: 'secondary',
    sessions: 'secondary',
    search_history: 'secondary',
    bulk_jobs: 'secondary',
    export_jobs: 'secondary',
    integration_sync_runs: 'secondary',
    terminal_syncs: 'secondary',
    stats: 'secondary',
    photos: 'secondary',
    embeddings_withdrawn: 'secondary',
    unknown_identities: 'secondary',
    audit: 'secondary',
  }),
  texts: {
    access_decisions: cls('Access decisions', 'What the doors decided about whom, with the grants and overrides only these decisions still refer to.'),
    auth_evidence: cls('Face authentication evidence', 'The frames kept as evidence of face authentication attempts (files of kind auth_capture).'),
    auth_attempts: cls('Face authentication attempts', 'Face authentication sessions, attempts and replay digests. Kept at least 365 days.'),
    deliveries: cls('Notification deliveries', 'Notifications sent by email, SMS or push, and the inbox rows of members.'),
    webhook_deliveries: cls('Webhook deliveries', 'Calls made to webhook subscriptions, with their request and answer.'),
    reports: cls('Reports', 'Generated reports and their files.'),
    incidents: cls('Incidents', 'Closed incidents with their notes and activities (incidents still open are never purged).'),
    events: cls('Events', 'Events raised by the rules and the platform.'),
    detections: cls('Detections', 'Faces the cameras detected, with their snapshots.'),
    locations: cls('Locations', 'Where each identity was seen last, area by area (tracking).'),
    sessions: cls('Tracking sessions', 'Visits of an identity to a facility, from the first to the last sighting.'),
    search_history: cls('Search history', 'Face searches, their results and the uploaded search images.'),
    bulk_jobs: cls('Bulk jobs', 'Bulk imports, updates and searches with their rows and files.'),
    export_jobs: cls('Export jobs', 'Finished export jobs and the files they produced.'),
    integration_sync_runs: cls('Integration sync runs', 'Finished runs of the integrations (HR, SIEM, BMS) with their counts and errors.'),
    terminal_syncs: cls('Terminal sync log', 'Each push of the access policy to a terminal.'),
    stats: cls('Statistics', 'Aggregated statistics buckets (hourly area stats, daily facility stats, transitions).'),
    photos: cls('Photos of archived faces', 'Face photos of unknown identities that were archived.'),
    embeddings_withdrawn: cls(
      'Face templates after withdrawn consent',
      'The face templates of people who withdrew biometric consent. Without a policy the consent window of the organization settings applies.',
    ),
    unknown_identities: cls('Unknown identities', 'Camera identities never linked to a profile.'),
    audit: cls('Audit log', 'Who changed what and when. Kept at least 365 days.'),
  },
});

export const retentionActionEnum = defineEnum({
  name: RETENTION_ACTION_ENUM,
  values: enumValues(RETENTION_ACTIONS, { delete: 'destructive', anonymize: 'warning', archive: 'secondary' }),
  texts: {
    delete: { label: 'Delete', doc: { summary: 'The rows go, with the files only they refer to.' } },
    anonymize: {
      label: 'Anonymize',
      doc: { summary: 'The rows stay for counts and trends, without the people they named and without their payload.' },
    },
    archive: { label: 'Archive', doc: { summary: 'The rows stay, without their attached files and derived rows (reports and bulk jobs only).' } },
  },
});

export const retentionRunStatusEnum = defineEnum({
  name: RETENTION_RUN_STATUS_ENUM,
  values: enumValues(RETENTION_RUN_STATUSES, { running: 'info', completed: 'success', failed: 'destructive', interrupted: 'warning' }),
  texts: {
    running: { label: 'Running', doc: { summary: 'Purging now; a run that stops half way is continued by the next one.' } },
    completed: { label: 'Completed', doc: { summary: 'Every class was purged up to its cutoff.' } },
    failed: { label: 'Failed', doc: { summary: 'A class stopped with an error (shown on its row); the other classes ran.' } },
    interrupted: {
      label: 'Interrupted',
      doc: { summary: 'Abandoned while running (the worker stopped); the next run continues the work.' },
    },
  },
});

export const COMPLIANCE_ENUMS = [retentionDataClassEnum, retentionActionEnum, retentionRunStatusEnum] as const;

export const COMPLIANCE_ENUM_TABLES: Readonly<Record<string, string>> = {
  [RETENTION_DATA_CLASS_ENUM]: 'retention_data_classes',
  [RETENTION_ACTION_ENUM]: 'retention_actions',
  [RETENTION_RUN_STATUS_ENUM]: 'retention_run_statuses',
};
