import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Bulk job enums (spec §6.11, SA_3 §2.1.2 / §2.1.4): the rows of the Hasura enum tables in `BULK_ENUM_TABLES`
 * (`bulk_job_kinds`, `bulk_job_statuses`, `bulk_job_row_outcomes`), plus the console-only update keys of a
 * profile update (`options.update_key`, checked by `itap.valid_bulk_job_options`).
 */

export const BULK_JOB_KIND_ENUM = 'bulk_job_kind';
export const BULK_JOB_STATUS_ENUM = 'bulk_job_status';
export const BULK_JOB_ROW_OUTCOME_ENUM = 'bulk_job_row_outcome';
/** `options.update_key` of a profile update: the column that finds each profile. */
export const BULK_UPDATE_KEY_ENUM = 'bulk_update_key';

export const BULK_JOB_KINDS = ['profile_import', 'profile_update', 'bulk_search'] as const;
export const BULK_JOB_STATUSES = ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'] as const;
export const BULK_JOB_ROW_OUTCOMES = ['created', 'updated', 'validated', 'skipped', 'failed', 'matched', 'no_match'] as const;
export const BULK_UPDATE_KEYS = ['employee_id', 'email', 'code'] as const;

export type BulkJobKind = (typeof BULK_JOB_KINDS)[number];

/** Row outcomes counted as succeeded (`itap.bulk_job_refresh_counts`). */
export const BULK_SUCCEEDED_OUTCOMES = ['created', 'updated', 'validated', 'matched', 'no_match'] as const;
/** Statuses a job moves on from by itself. */
export const BULK_PENDING_STATUSES: ReadonlySet<string> = new Set(['queued', 'running']);

export const bulkJobKindEnum = defineEnum({
  name: BULK_JOB_KIND_ENUM,
  values: enumValues(BULK_JOB_KINDS, { profile_import: 'info', profile_update: 'secondary', bulk_search: 'outline' }),
  texts: {
    profile_import: { label: 'Profile import', doc: { summary: 'Creates one profile per row of a CSV file.' } },
    profile_update: {
      label: 'Profile update',
      doc: { summary: 'Changes existing profiles, each found by its employee ID, email or code, from a CSV file.' },
    },
    bulk_search: { label: 'Bulk face search', doc: { summary: 'Runs one face search per photo and lists the best match of each.' } },
  },
});

export const bulkJobStatusEnum = defineEnum({
  name: BULK_JOB_STATUS_ENUM,
  values: enumValues(BULK_JOB_STATUSES, {
    queued: 'secondary',
    running: 'info',
    completed: 'success',
    partial: 'warning',
    failed: 'destructive',
    cancelled: 'outline',
  }),
  texts: {
    queued: { label: 'Queued', doc: { summary: 'Waiting to start; a job usually starts within seconds.' } },
    running: { label: 'Running', doc: { summary: 'The rows are being applied one by one; the counts move as it goes.' } },
    completed: { label: 'Completed', doc: { summary: 'Every row succeeded or was blank; the result file lists them.' } },
    partial: {
      label: 'Partly failed',
      doc: { summary: 'Some rows failed and the others were applied; each failed row says why, and Retry runs only the failed ones again.' },
    },
    failed: {
      label: 'Failed',
      doc: { summary: 'The job could not run (for example the file’s header is wrong) or every row failed; the error says why.' },
    },
    cancelled: { label: 'Cancelled', doc: { summary: 'Stopped by a member; the rows applied before it stopped stay applied.' } },
  },
});

export const bulkJobRowOutcomeEnum = defineEnum({
  name: BULK_JOB_ROW_OUTCOME_ENUM,
  values: enumValues(BULK_JOB_ROW_OUTCOMES, {
    created: 'success',
    updated: 'success',
    validated: 'info',
    skipped: 'secondary',
    failed: 'destructive',
    matched: 'success',
    no_match: 'outline',
  }),
  texts: {
    created: { label: 'Created', doc: { summary: 'A new profile was created from the row.' } },
    updated: { label: 'Updated', doc: { summary: 'The profile the row names was changed.' } },
    validated: { label: 'Valid (dry run)', doc: { summary: 'A dry run found the row valid; nothing was saved.' } },
    skipped: { label: 'Skipped', doc: { summary: 'The row was blank, so there was nothing to do.' } },
    failed: { label: 'Failed', doc: { summary: 'The row was refused and nothing of it was saved; the error says why.' } },
    matched: { label: 'Matched', doc: { summary: 'The photo’s search found at least one identity; the best one is shown.' } },
    no_match: { label: 'No match', doc: { summary: 'The photo’s search ran and found nobody above the threshold.' } },
  },
});

export const bulkUpdateKeyEnum = defineEnum({
  name: BULK_UPDATE_KEY_ENUM,
  values: enumValues(BULK_UPDATE_KEYS, { employee_id: 'secondary', email: 'secondary', code: 'secondary' }),
  texts: {
    employee_id: { label: 'Employee ID', doc: { summary: 'Each row names the profile by its employee ID (exact).' } },
    email: { label: 'Email', doc: { summary: 'Each row names the profile by its email address (upper and lower case alike).' } },
    code: { label: 'Profile code', doc: { summary: 'Each row names the profile by its code, such as PROFILE-00042 (exact).' } },
  },
});

/** Each Hasura-backed enum above by the enum table holding its values. */
export const BULK_ENUM_TABLES: Readonly<Record<string, string>> = {
  [BULK_JOB_KIND_ENUM]: 'bulk_job_kinds',
  [BULK_JOB_STATUS_ENUM]: 'bulk_job_statuses',
  [BULK_JOB_ROW_OUTCOME_ENUM]: 'bulk_job_row_outcomes',
};
