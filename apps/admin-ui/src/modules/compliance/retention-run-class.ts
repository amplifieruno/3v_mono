import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { FACILITY_RESOURCE, RETENTION_POLICY_RESOURCE, RETENTION_RUN_CLASS_RESOURCE, RETENTION_RUN_RESOURCE } from '../../data/resource-names';
import { RETENTION_ACTIONS, RETENTION_ACTION_ENUM, RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM } from '../../enums/compliance';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';

const count = (label: string, summary: string) => f.number({ system: true, texts: { label, doc: { summary } } });

/** Columns of `itap.retention_run_classes` the `org_admin` role reads: written by the nightly run only. */
export const retentionRunClassFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  run_id: f.relation({
    to: RETENTION_RUN_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Run', doc: { summary: 'The nightly retention run this row belongs to.' } },
  }),
  data_class: enumField(RETENTION_DATA_CLASSES, RETENTION_DATA_CLASS_ENUM, {
    system: true,
    texts: { label: 'Data class', doc: { summary: 'The kind of data purged by this row of the run.' } },
  }),
  facility_id: f.relation({
    to: FACILITY_RESOURCE,
    system: true,
    nullable: true,
    open: 'page',
    texts: { label: 'Facility', doc: { summary: 'The facility of a facility-specific policy; empty for the whole organization (minus the facilities with a policy of their own).' } },
  }),
  policy_id: f.relation({
    to: RETENTION_POLICY_RESOURCE,
    system: true,
    nullable: true,
    open: 'page',
    texts: { label: 'Policy', doc: { summary: 'The policy applied; empty for the consent window of the organization settings (face templates after withdrawn consent).' } },
  }),
  action: enumField(RETENTION_ACTIONS, RETENTION_ACTION_ENUM, {
    system: true,
    texts: { label: 'Action', doc: { summary: 'What was done to the rows past the cutoff: deleted, anonymized or archived.' } },
  }),
  cutoff: dateTime({ system: true, texts: { label: 'Cutoff', doc: { summary: 'Rows older than this moment were purged (the run’s time minus the policy’s days).' } } }),
  affected: count('Purged', 'Rows deleted, anonymized or archived by this row of the run.'),
  skipped_by_hold: count('Kept by a legal hold', 'Rows past the cutoff that an active legal hold kept; they are purged by a later run once the hold ends.'),
  files_enqueued: count(
    'Files queued',
    'Files queued for deletion with the rows, including the uploaded originals of purged face crops; storage deletes them within about 10 minutes.',
  ),
  batches: count('Batches', 'How many batches of at most 500 rows the class took.'),
  completed_at: dateTime({ system: true, texts: { label: 'Completed', doc: { summary: 'When the class was drained; empty while running or after an error.' } } }),
  error: f.text({ system: true, nullable: true, texts: { label: 'Error', doc: { summary: 'Why the class stopped; the other classes of the run still ran.' } } }),
};

/** The columns of a run's classes (its page) and of a policy's runs (the policy page). */
export const RUN_CLASS_COLUMNS = ['data_class', 'facility_id', 'action', 'cutoff', 'affected', 'skipped_by_hold', 'files_enqueued', 'completed_at', 'error'] as const;

/**
 * The classes of a retention run (`itap.retention_run_classes`): one row per class and scope the
 * run purged, with its counts. A read-only log, listed on the run's page and on the policy's page.
 */
export const retentionRunClass = defineResource(RETENTION_RUN_CLASS_RESOURCE, {
  texts: {
    label: 'Retention run class',
    labelPlural: 'Retention run classes',
    doc: { summary: 'What one nightly retention run did to one class of data: its cutoff and how many rows it purged, kept for a hold or queued files for.' },
  },
  basePath: '/retention-run-classes',
  displayField: 'data_class',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: retentionRunClassFields,
  views: { list: { page: false, columns: [...RUN_CLASS_COLUMNS] }, show: { page: false } },
});
