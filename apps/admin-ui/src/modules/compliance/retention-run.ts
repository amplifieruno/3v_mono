import { defineResource, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { RETENTION_RUN_CLASS_RESOURCE, RETENTION_RUN_RESOURCE } from '../../data/resource-names';
import { RETENTION_RUN_STATUSES, RETENTION_RUN_STATUS_ENUM } from '../../enums/compliance';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { recordDate } from '../people/record-date';
import { RUN_CLASS_COLUMNS } from './retention-run-class';

/** Columns of `itap.retention_runs` the `org_admin` role reads: written by the nightly run only. */
export const retentionRunFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  scheduled_at: dateTime({
    system: true,
    texts: { label: 'Scheduled', doc: { summary: 'The moment the run purges up to: every cutoff is this moment minus the policy’s days.' } },
  }),
  status: enumField(RETENTION_RUN_STATUSES, RETENTION_RUN_STATUS_ENUM, {
    system: true,
    texts: { label: 'Status', doc: { summary: 'Running, completed, failed (a class stopped with an error) or interrupted (continued by the next run).' } },
  }),
  started_at: dateTime({ system: true, texts: { label: 'Started', doc: { summary: 'When the run began purging.' } } }),
  finished_at: dateTime({ system: true, texts: { label: 'Finished', doc: { summary: 'When the run ended; empty while it runs.' } } }),
  error: f.text({ system: true, nullable: true, texts: { label: 'Error', doc: { summary: 'Why the run failed; the failing class says more on its row.' } } }),
};

/**
 * Retention runs (`itap.retention_runs`): the nightly purge (03:30 UTC, `retention_cleanup`) of
 * every active policy, one run per night, with a row per class and scope. A read-only log: no
 * create, edit or delete; nothing in the console starts a run (the retention plan only counts).
 */
export const retentionRun = defineResource(RETENTION_RUN_RESOURCE, {
  texts: {
    label: 'Retention run',
    labelPlural: 'Retention runs',
    doc: {
      summary:
        'One nightly purge of the data past its retention, with what it did per class: rows purged, rows kept by legal holds and files queued for deletion.',
    },
  },
  basePath: '/retention-runs',
  section: NAV_SECTIONS.compliance,
  order: 30,
  icon: NAV_ICONS.retentionRuns,
  displayField: 'scheduled_at',
  recordTitle: (record) => recordDate('Retention run of', record.scheduled_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: retentionRunFields,
  views: {
    list: {
      columns: ['scheduled_at', 'status', 'started_at', 'finished_at', 'error'],
      defaultSort: [{ field: 'scheduled_at', direction: 'desc' }],
      filters: { pinned: ['status'], fields: ['status', 'scheduled_at'] },
      savedViews: [{ id: 'not-completed', texts: 'Failed or interrupted', state: { filters: [{ field: 'status', op: 'in', value: ['failed', 'interrupted'] }] } }],
    },
    show: {
      header: (l) => [l.grid(['scheduled_at', 'status', 'started_at', 'finished_at'])],
      body: (l) => [
        l.panel(['error'], { key: 'run-error', tone: 'destructive', texts: { title: 'The run failed' }, when: l.present(l.ref('record', 'error')) }),
        l.place(relatedList(resourceByName(RETENTION_RUN_CLASS_RESOURCE)), {
          key: 'run-classes',
          texts: { title: 'Classes' },
          props: { where: [{ field: 'run_id', op: 'eq', value: l.ref('record', 'id') }], columns: [...RUN_CLASS_COLUMNS, 'policy_id'], open: 'none' },
        }),
      ],
    },
  },
});
