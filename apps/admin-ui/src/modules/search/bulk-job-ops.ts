import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { BULK_JOB_RESOURCE, BULK_JOB_ROW_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MEMBER_NOT_ACTIVE_REFUSAL, type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { BULK_JOB_KINDS } from '../../enums/bulk';

/** The registry key the bulk job operations are bound under. */
export const BULK_JOBS_BINDING = 'bulk-jobs';

const NOTHING = ' Nothing was started.';
const UNCHANGED = ' Nothing was changed.';

/** What inserting a job is refused with (`bulk_jobs_guard`, the options check, the owner check). */
export const CREATE_BULK_JOB_REFUSALS = {
  bulk_input_required: 'A job needs its input file: upload it first.' + NOTHING,
  bulk_input_not_found: 'The input file could not be found among your uploads: upload it again.' + NOTHING,
  bulk_jobs_options_valid:
    'The options are refused: the threshold must be between 0.2 and 0.95 and the results per photo between 1 and 100.' + NOTHING,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
} satisfies Record<string, SqlRefusalText>;

/** What `retry_bulk_job` raises. */
export const RETRY_BULK_JOB_REFUSALS = {
  bulk_job_not_found: 'The job no longer exists, or it is someone else’s bulk search.' + UNCHANGED,
  bulk_job_not_retryable: 'The job is no longer failed (someone retried it already): reload it to see where it stands.' + UNCHANGED,
  bulk_input_missing: 'The job’s input file was deleted, so it cannot run again: start a new job.' + UNCHANGED,
} satisfies Record<string, SqlRefusalText>;

/** What `cancel_bulk_job` raises. */
export const CANCEL_BULK_JOB_REFUSALS = {
  bulk_job_not_found: RETRY_BULK_JOB_REFUSALS.bulk_job_not_found,
  bulk_job_not_cancellable: 'The job has already finished, so there is nothing to cancel: reload it to see how it ended.' + UNCHANGED,
} satisfies Record<string, SqlRefusalText>;

export const newBulkJobSchema = z.object({
  kind: z.enum(BULK_JOB_KINDS),
  input_file_id: z.string().uuid(),
  options: z.record(z.union([z.string(), z.number(), z.boolean()])),
});

const jobRef = z.object({ id: z.string(), code: z.string(), status: z.string() });

/** One row of `bulk_jobs` from a mutation's `SETOF` answer. */
const firstRow = (data: unknown, root: string): unknown => {
  const rows = rootOf(data, root);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
};

/** Inserts a job (kind, input file, options; the owner from the session); `run_bulk_job` starts it. */
export const createBulkJobOperation = hasuraOperation(
  BULK_JOBS_BINDING,
  'createBulkJob',
  {
    kind: 'mutation',
    document: `mutation CreateBulkJob($object: bulk_jobs_insert_input!) {
  insert_bulk_jobs_one(object: $object) { id code status }
}`,
    variables: (input) => ({ object: input }),
    mapResult: (data) => rootOf(data, 'insert_bulk_jobs_one') ?? null,
  },
  sqlRefusals(CREATE_BULK_JOB_REFUSALS, 'The job was refused: {{detail}}.' + NOTHING),
);

/** `retry_bulk_job`: a failed or partly failed job back to queued; only its failed rows run again. */
export const retryBulkJobOperation = hasuraOperation(
  BULK_JOBS_BINDING,
  'retryBulkJob',
  {
    kind: 'mutation',
    document: `mutation RetryBulkJob($job: uuid!) {
  retry_bulk_job(args: { p_job: $job }) { id code status }
}`,
    variables: (input) => ({ job: (input as { jobId: string }).jobId }),
    mapResult: (data) => firstRow(data, 'retry_bulk_job'),
  },
  sqlRefusals(RETRY_BULK_JOB_REFUSALS),
);

/** `cancel_bulk_job`: a queued or running job to cancelled; its worker stops at the next row. */
export const cancelBulkJobOperation = hasuraOperation(
  BULK_JOBS_BINDING,
  'cancelBulkJob',
  {
    kind: 'mutation',
    document: `mutation CancelBulkJob($job: uuid!) {
  cancel_bulk_job(args: { p_job: $job }) { id code status }
}`,
    variables: (input) => ({ job: (input as { jobId: string }).jobId }),
    mapResult: (data) => firstRow(data, 'cancel_bulk_job'),
  },
  sqlRefusals(CANCEL_BULK_JOB_REFUSALS),
);

/** A job's progress, read by the progress block while it is queued or running. */
export const bulkJobProgress = z.object({
  id: z.string(),
  status: z.string(),
  total: z.number().nullable(),
  processed: z.number(),
  succeeded: z.number(),
  failed: z.number(),
  skipped: z.number(),
  error: z.string().nullable(),
  attempts: z.number(),
  attempts_at_retry: z.number(),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
});

export type BulkJobProgress = z.infer<typeof bulkJobProgress>;

export const bulkJobProgressOperation = hasuraOperation(BULK_JOBS_BINDING, 'bulkJobProgress', {
  kind: 'query',
  document: `query BulkJobProgress($id: uuid!) {
  bulk_jobs_by_pk(id: $id) {
    id status total processed succeeded failed skipped error attempts attempts_at_retry started_at completed_at
  }
}`,
  variables: (input) => ({ id: (input as { jobId: string }).jobId }),
  mapResult: (data) => {
    const row = bulkJobProgress.safeParse(rootOf(data, 'bulk_jobs_by_pk'));
    return row.success ? row.data : null;
  },
});

const JOB_EFFECTS = [{ resource: BULK_JOB_RESOURCE }, { resource: BULK_JOB_ROW_RESOURCE }];
const jobInput = schema(z.object({ jobId: z.string().uuid() }));

/** "Import profiles", "Update profiles", "Bulk face search": the job, queued. */
export const createBulkJob = defineMutation('itap:create-bulk-job', {
  binding: createBulkJobOperation.binding,
  input: schema(newBulkJobSchema),
  output: schema(jobRef.nullable()),
  effects: JOB_EFFECTS,
});

/** "Retry" on a failed or partly failed job. */
export const retryBulkJob = defineMutation('itap:retry-bulk-job', {
  binding: retryBulkJobOperation.binding,
  input: jobInput,
  output: schema(jobRef.nullable()),
  effects: JOB_EFFECTS,
});

/** "Cancel" on a queued or running job. */
export const cancelBulkJob = defineMutation('itap:cancel-bulk-job', {
  binding: cancelBulkJobOperation.binding,
  input: jobInput,
  output: schema(jobRef.nullable()),
  effects: JOB_EFFECTS,
});

/** One job's progress (`itap:bulk-job-progress`). */
export const bulkJobProgressQuery = defineQuery('itap:bulk-job-progress-read', {
  binding: bulkJobProgressOperation.binding,
  input: jobInput,
  output: schema(bulkJobProgress.nullable()),
  reads: [resourceByName(BULK_JOB_RESOURCE)],
});

export const BULK_JOB_OPERATIONS = [createBulkJobOperation, retryBulkJobOperation, cancelBulkJobOperation, bulkJobProgressOperation];
