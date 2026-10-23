import { type FlowConfig, type FlowUnknownCheck, cond, ref, source } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { BULK_JOB_RESOURCE } from '../../data/resource-names';
import { BULK_UPDATE_KEY_ENUM, BULK_UPDATE_KEYS, type BulkJobKind } from '../../enums/bulk';
import { enumField } from '../../enums/field';
import { BULK_INPUT_KIND, BULK_INPUT_MAX_BYTES, bulkSearchPhotosField } from '../../fields/bulk-fields';
import { storageFile } from '../../fields/storage-file';
import { cancelBulkJob, createBulkJob, retryBulkJob } from './bulk-job-ops';
import { type NewBulkJob, newBulkJobOf } from './bulk-job-shape';
import { searchFields } from './search-fields';
import { searchDefaults } from './search-ops';

const csvFile = storageFile({
  bucket: 'organization',
  kind: BULK_INPUT_KIND,
  accept: '.csv,text/csv',
  maxSize: BULK_INPUT_MAX_BYTES,
  required: true,
  texts: {
    label: 'CSV file',
    doc: { summary: 'The rows to apply, with a header row naming the columns (at most 10,000 rows and 5 MB). The job’s article has samples.' },
  },
});

const dryRun = f.boolean({
  texts: { label: 'Dry run', doc: { summary: 'Check every row as if applying it, and save nothing: each row comes out valid or failed.' } },
});

const importFields = { input_file_id: csvFile, dry_run: dryRun };

const updateFields = {
  input_file_id: csvFile,
  update_key: enumField(BULK_UPDATE_KEYS, BULK_UPDATE_KEY_ENUM, {
    required: true,
    texts: { label: 'Find profiles by', doc: { summary: 'The column naming the profile each row changes; that column is never changed itself.' } },
  }),
  dry_run: dryRun,
};

const searchJobFields = {
  input_file_id: bulkSearchPhotosField({
    texts: { label: 'Photos', doc: { summary: 'The face photos to search for, one search each; only you can see them and their results.' } },
  }),
  threshold: searchFields.threshold,
  max_results: searchFields.max_results,
};

/** What a "new job" flow last sent, for "Check again" after a lost answer (a check sees no form values, G12). */
let lastSent: NewBulkJob | null = null;

/** Applied when a job of that kind reading that input file exists (an input file is uploaded for one job). */
export const bulkJobCreated: FlowUnknownCheck = async ({ data }) => {
  const sent = lastSent;
  if (sent === null) return 'unknown';
  try {
    const { data: rows } = await data.list(resourceByName(BULK_JOB_RESOURCE) as never, {
      filter: {
        and: [
          { field: 'input_file_id', op: 'eq', value: sent.input_file_id },
          { field: 'kind', op: 'eq', value: sent.kind },
        ],
      },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (rows as readonly unknown[]).length > 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** The `submit` of a "new job" flow of `kind`. */
const submitNew = (kind: BulkJobKind) => ({
  mutation: createBulkJob,
  retry: 'never' as const,
  input: ({ values }: { readonly values: Readonly<Record<string, unknown>> }) => {
    lastSent = newBulkJobOf(kind, values);
    return lastSent;
  },
  onUnknown: { check: bulkJobCreated },
});

const opened = { notify: { params: { code: ref('result', 'code') } }, open: { id: ref('result', 'id') } };
const QUEUED = 'Job {{code}} is queued; its page follows it row by row.';

/** "Import profiles": a CSV of new profiles, one per row. */
export const importProfilesFlow = {
  texts: {
    label: 'Import profiles',
    notify: QUEUED,
    doc: { summary: 'Creates one profile per row of a CSV file (first_name and last_name required). A dry run checks the file without saving.' },
  },
  icon: NAV_ICONS.importProfiles,
  surfaces: { list: 'regular' },
  form: { fields: importFields, initial: { dry_run: { kind: 'literal', value: false } } },
  submit: submitNew('profile_import'),
  then: opened,
} satisfies FlowConfig<unknown, Record<never, never>, typeof importFields>;

/** "Update profiles": a CSV of changes, each row naming its profile by the chosen key. */
export const updateProfilesFlow = {
  texts: {
    label: 'Update profiles',
    notify: QUEUED,
    doc: {
      summary: 'Changes existing profiles from a CSV file, each row naming its profile by employee ID, email or code; empty cells change nothing.',
    },
  },
  icon: NAV_ICONS.updateProfiles,
  surfaces: { list: 'regular' },
  form: {
    fields: updateFields,
    initial: { update_key: { kind: 'literal', value: 'employee_id' }, dry_run: { kind: 'literal', value: false } },
  },
  submit: submitNew('profile_update'),
  then: opened,
} satisfies FlowConfig<unknown, Record<never, never>, typeof updateFields>;

/** "Bulk face search": one face search per photo, as you; the threshold starts at the organization's default. */
export const bulkSearchFlow = {
  texts: {
    label: 'Bulk face search',
    notify: QUEUED,
    doc: { summary: 'Runs one face search per photo and lists each photo’s best match. The job, its rows and their searches are yours only.' },
  },
  icon: NAV_ICONS.bulkSearch,
  surfaces: { list: 'regular' },
  with: { defaults: source.query(searchDefaults, {}) },
  form: {
    fields: searchJobFields,
    initial: { threshold: ref('defaults', 'threshold'), max_results: { kind: 'literal', value: 5 } },
  },
  submit: submitNew('bulk_search'),
  then: opened,
} satisfies FlowConfig<unknown, Record<never, never>, typeof searchJobFields>;

/** Applied when the job's status reads as one of `done` (the change happened, by this call or another). */
const statusIn =
  (done: readonly string[]): FlowUnknownCheck =>
  async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(BULK_JOB_RESOURCE) as never, { id } as never);
      const status = (row as Readonly<Record<string, unknown>> | null | undefined)?.status;
      return typeof status !== 'string' ? 'unknown' : done.includes(status) ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };

/**
 * Applied when the job ran again since the page read it: it is queued, running or completed now, or a
 * worker started a new attempt (`attempts` grew; a failed or partial job is only claimed again after a
 * retry), so a retried job that ended partial or failed again still reads as applied.
 */
export const retryApplied: FlowUnknownCheck = async ({ record, data }) => {
  const before = record as Readonly<Record<string, unknown>> | null | undefined;
  const id = before?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: row } = await data.one(resourceByName(BULK_JOB_RESOURCE) as never, { id } as never);
    const now = row as Readonly<Record<string, unknown>> | null | undefined;
    if (typeof now?.status !== 'string') return 'unknown';
    if (['queued', 'running', 'completed'].includes(now.status)) return 'applied';
    const was = typeof before?.attempts === 'number' ? before.attempts : null;
    if (was === null || typeof now.attempts !== 'number') return 'unknown';
    return now.attempts > was ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** Statuses Retry is offered on: the job failed, or some of its rows did (Review Focus 4). */
export const RETRYABLE_STATUSES = ['failed', 'partial'] as const;
/** Statuses Cancel is offered on: the job has not finished. */
export const CANCELLABLE_STATUSES = ['queued', 'running'] as const;

/**
 * "Retry" on a failed or partly failed job (`retry_bulk_job`): queued again with three new attempts;
 * rows that succeeded are kept and only the failed ones (and any not reached) run again.
 */
export const retryBulkJobFlow = {
  texts: {
    label: 'Retry',
    confirm: 'Run this job again? Rows that succeeded are kept; only the failed rows and any not reached run again.',
    notify: 'The job is queued again.',
    doc: { summary: 'Runs a failed or partly failed job again: the rows that succeeded are kept, the failed ones are tried again.' },
  },
  icon: NAV_ICONS.retryBulkJob,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: cond.in(ref('record', 'status'), [...RETRYABLE_STATUSES]),
  confirm: true,
  submit: { mutation: retryBulkJob, retry: 'never', input: { jobId: ref('record', 'id') }, onUnknown: { check: retryApplied } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** "Cancel" on a queued or running job (`cancel_bulk_job`): it stops at its next row. */
export const cancelBulkJobFlow = {
  texts: {
    label: 'Cancel job',
    confirm: 'Cancel this job? It stops at its next row; the rows applied so far stay applied.',
    notify: 'The job is cancelled.',
    doc: { summary: 'Stops a queued or running job at its next row. Rows applied before stay applied; the job is not run again.' },
  },
  icon: NAV_ICONS.cancelBulkJob,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: cond.in(ref('record', 'status'), [...CANCELLABLE_STATUSES]),
  confirm: true,
  submit: { mutation: cancelBulkJob, retry: 'never', input: { jobId: ref('record', 'id') }, onUnknown: { check: statusIn(['cancelled']) } },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
