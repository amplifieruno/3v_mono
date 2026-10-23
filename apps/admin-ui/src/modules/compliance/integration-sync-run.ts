import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { INTEGRATION_RESOURCE, INTEGRATION_SYNC_RUN_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { JOB_TRIGGERS, JOB_TRIGGER_ENUM, SYNC_RUN_STATUSES, SYNC_RUN_STATUS_ENUM } from '../../enums/compliance-integrations';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { storageFile } from '../../fields/storage-file';
import { recordDate } from '../people/record-date';
import { jobWatchBlock } from './job-watch-block';

/** `storage.files.metadata.kind` of an HR fixture: employee data, every opening audited (`open_file`). */
export const INTEGRATION_FIXTURE_KIND = 'integration_fixture';

/** Page size of the sync log. */
export const SYNC_RUN_PAGE_SIZE = 50;

const count = (label: string, summary: string, inList = true) =>
  f.number({ system: true, in: inList ? ['list', 'show'] : ['show'], texts: { label, doc: { summary } } });

/**
 * Columns of `itap.integration_sync_runs` the `org_admin` role reads: one row per sync, written by
 * the platform only (the `run_sync` job; append-only, never changed by a member).
 */
export const syncRunFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  started_at: dateTime({ system: true, texts: { label: 'Started', doc: { summary: 'When the run was requested (by hand or by the schedule).' } } }),
  integration_id: f.relation({
    to: INTEGRATION_RESOURCE,
    system: true,
    open: 'page',
    texts: { label: 'Integration', doc: { summary: 'The integration that synced.' } },
  }),
  trigger: enumField(JOB_TRIGGERS, JOB_TRIGGER_ENUM, {
    system: true,
    texts: { label: 'Started by', doc: { summary: 'By hand (Run sync) or by the schedule.' } },
  }),
  status: enumField(SYNC_RUN_STATUSES, SYNC_RUN_STATUS_ENUM, {
    system: true,
    texts: { label: 'Status', doc: { summary: 'Running, succeeded or failed; only one run of an integration runs at a time.' } },
  }),
  finished_at: dateTime({ system: true, texts: { label: 'Finished', doc: { summary: 'When the run ended.' } } }),
  records_in: count('Read', 'Records read from the source (HR fixture rows, occupancy rows).'),
  records_out: count('Written', 'Records written or sent: profiles created, updated or deactivated, or events a stub would send.'),
  created_count: count('Created', 'Profiles created by an HR sync.', false),
  updated_count: count('Updated', 'Profiles whose columns changed (unchanged ones are not written).', false),
  deactivated_count: count('Deactivated', 'Profiles no longer in the HR feed, made inactive.', false),
  skipped_count: count('Skipped', 'Records refused, each with a code in Problems (never its values).'),
  skipped_restricted: count('Skipped: restricted', 'People under restriction of processing: neither updated nor deactivated (GDPR Art. 18).', false),
  skipped_suppressed: count('Skipped: erased', 'People erased by a data subject request: never created again.', false),
  errors: f.json({
    system: true,
    in: ['show'],
    texts: { label: 'Problems', doc: { summary: 'Up to 50 refused records as {row, code}: the row of the source file and why (such as missing_name).' } },
  }),
  error: f.string({ system: true, nullable: true, in: ['list', 'show'], texts: { label: 'Error', doc: { summary: 'Why the run failed, as a code.' } } }),
  fixture_file_id: storageFile({
    bucket: 'organization',
    kind: INTEGRATION_FIXTURE_KIND,
    sensitive: true,
    displayOnly: true,
    in: ['show'],
    texts: { label: 'Fixture file', doc: { summary: 'The HR file this run applied (employee data): opening it is audited.' } },
  }),
  requested_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: ['show'],
    open: 'none',
    texts: { label: 'Requested by', doc: { summary: 'The member who started a run by hand; empty for a scheduled run.' } },
  }),
  attempts: f.number({ system: true, in: ['show'], texts: { label: 'Attempts', doc: { summary: 'How many times a worker picked the run up; three fail it.' } } }),
};

export const SYNC_RUN_COLUMNS = ['started_at', 'trigger', 'status', 'records_in', 'records_out', 'skipped_count', 'error'] as const;

/**
 * Integration sync runs (`itap.integration_sync_runs`): the log of every sync, newest first;
 * append-only (no create, edit or delete), keyset paging, no count on every page.
 */
export const integrationSyncRun = defineResource(INTEGRATION_SYNC_RUN_RESOURCE, {
  texts: {
    label: 'Sync run',
    labelPlural: 'Sync runs',
    doc: { summary: 'One sync of an integration: when, by hand or on schedule, what it read and wrote, what it skipped and why it failed. Never changed.' },
  },
  basePath: '/integration-sync-runs',
  section: NAV_SECTIONS.compliance,
  order: 72,
  icon: NAV_ICONS.syncRuns,
  displayField: 'started_at',
  recordTitle: (record) => recordDate('Sync run at', record.started_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: syncRunFields,
  views: {
    list: {
      columns: ['started_at', 'integration_id', 'trigger', 'status', 'records_in', 'records_out', 'skipped_count', 'error'],
      defaultSort: [{ field: 'started_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: SYNC_RUN_PAGE_SIZE,
      filters: { pinned: ['integration_id', 'status'], fields: ['integration_id', 'status', 'trigger', 'started_at'] },
      savedViews: [{ id: 'failed', texts: 'Failed', state: { filters: [{ field: 'status', op: 'eq', value: 'failed' }] } }],
    },
    show: {
      header: (l) => [l.grid(['integration_id', 'status', 'trigger', 'started_at'])],
      body: (l) => [
        l.place(jobWatchBlock, { key: 'sync-watch', props: { job: 'sync_run', id: l.ref('record', 'id'), status: l.ref('record', 'status') } }),
        l.panel(['error'], { key: 'failure', tone: 'destructive', texts: { title: 'The sync failed' }, when: l.present(l.ref('record', 'error')) }),
        l.panel(
          [
            l.grid(['records_in', 'records_out', 'skipped_count']),
            l.grid(['created_count', 'updated_count', 'deactivated_count']),
            l.grid(['skipped_restricted', 'skipped_suppressed']),
            'errors',
          ],
          { key: 'counts', texts: { title: 'What it did' } },
        ),
        l.grid(['finished_at', 'requested_by', 'attempts']),
        'fixture_file_id',
      ],
    },
  },
});
