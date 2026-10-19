import { errorText } from '../reports/generate.js';
import { isBulkKind, MAX_FILE_BYTES, MAX_ROWS, resolveBulkOptions, validateHeader, type BulkKind } from './columns.js';
import { CsvError, parseCsv } from './csv.js';
import { CLAIM, COMPLETE, FAIL, JobFailure, JobStopped, PROGRESS, type BulkDeps, type Job } from './ops.js';
import { JOB_ROW_FIELDS, resultCsv, type JobRow } from './result.js';
import { applyRow } from './rows.js';

/** Progress cadence: every 25 rows or 2 seconds (counters, resume point, lease extension, owner / cancel check). */
export const PROGRESS_ROWS = 25;
export const PROGRESS_MS = 2000;

export type BulkResult =
  | { job_id: string; skipped: 'not_claimed' }
  | { job_id: string; stopped: string }
  | { job_id: string; status: string; error?: string };

const INPUT_FILE = `query BulkInputFile($id: uuid!) { file(id: $id) { id bucketId size isUploaded } }`;
const CUSTOM_KEYS = `
  query BulkCustomKeys($org: uuid!) {
    custom_attribute_definitions(where: { organization_id: { _eq: $org }, entity: { _eq: profile } }) { key }
  }
`;
const ROWS = `
  query BulkJobRows($job: uuid!) { bulk_job_rows(where: { bulk_job_id: { _eq: $job } }, order_by: { row_no: asc }) { ${JOB_ROW_FIELDS} } }
`;
const JOB_STATE = `query BulkJobState($id: uuid!) { bulk_jobs_by_pk(id: $id) { id organization_id status error result_file_id } }`;
const LEFTOVER_FILES = `
  query BulkLeftoverFiles($bucket: String!, $meta: jsonb!) { files(where: { bucketId: { _eq: $bucket }, metadata: { _contains: $meta } }) { id } }
`;

/** Header-mapped records of the input file; job-level problems are JobFailure codes. */
async function loadInput(job: Job, kind: BulkKind, deps: BulkDeps): Promise<{ columns: string[]; records: string[][] }> {
  if (!job.input_file_id) throw new JobFailure('bulk_input_missing');
  const { file } = await deps.admin.request<{ file: { bucketId: string; size: number | null; isUploaded: boolean | null } | null }>(
    INPUT_FILE,
    { id: job.input_file_id },
  );
  if (!file || file.bucketId !== job.organization_id.toLowerCase() || file.isUploaded !== true) throw new JobFailure('bulk_input_missing');
  if ((file.size ?? 0) > MAX_FILE_BYTES) throw new JobFailure('file_too_large');
  const data = await deps.storage.download(job.input_file_id);
  if (data.length > MAX_FILE_BYTES) throw new JobFailure('file_too_large');
  let records: string[][];
  try {
    records = parseCsv(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error: unknown) {
    if (error instanceof CsvError) throw new JobFailure(`csv_invalid: ${error.message}`);
    if (error instanceof TypeError) throw new JobFailure('csv_invalid: not UTF-8 text');
    throw error;
  }
  const [header, ...rows] = records;
  if (!header || header.every((c) => c.trim() === '')) throw new JobFailure('header_missing');
  if (header.some((c) => c.includes('\u0000'))) throw new JobFailure('csv_invalid: NUL character');
  if (rows.length > MAX_ROWS) throw new JobFailure('too_many_rows');
  const { custom_attribute_definitions: defs } =
    kind === 'bulk_search'
      ? { custom_attribute_definitions: [] }
      : await deps.admin.request<{ custom_attribute_definitions: { key: string }[] }>(CUSTOM_KEYS, { org: job.organization_id });
  const checked = validateHeader(kind, header, {
    updateKey: resolveBulkOptions(job.options).updateKey,
    customKeys: new Set(defs.map((d) => d.key)),
  });
  if (checked.ok === false) throw new JobFailure(checked.error);
  return { columns: checked.columns, records: rows };
}

async function jobRows(job: Job, deps: BulkDeps): Promise<JobRow[]> {
  return (await deps.admin.request<{ bulk_job_rows: JobRow[] }>(ROWS, { job: job.id })).bulk_job_rows;
}

/** Files an earlier attempt uploaded but never attached (metadata.bulk_job_id), except the job's result. Best effort. */
async function sweepLeftovers(job: Pick<Job, 'id' | 'organization_id' | 'result_file_id'>, deps: BulkDeps): Promise<void> {
  try {
    const { files } = await deps.admin.request<{ files: { id: string }[] }>(LEFTOVER_FILES, {
      bucket: job.organization_id.toLowerCase(),
      meta: { bulk_job_id: job.id },
    });
    for (const f of files) if (f.id !== job.result_file_id) await deps.storage.deleteFile(f.id).catch(() => undefined);
  } catch {
    // The next claim sweeps again.
  }
}

/**
 * A refused claim that failed the job (max_attempts, owner_inactive) leaves no attempt to sweep the files earlier
 * attempts uploaded: sweep them here. Best effort.
 */
async function sweepAfterRefusedClaim(id: string, deps: BulkDeps): Promise<void> {
  type State = Pick<Job, 'id' | 'organization_id' | 'status' | 'result_file_id'> & { error: string | null };
  const state = await deps.admin
    .request<{ bulk_jobs_by_pk: State | null }>(JOB_STATE, { id })
    .then((r) => r.bulk_jobs_by_pk)
    .catch(() => null);
  if (state?.status === 'failed' && (state.error === 'max_attempts' || state.error === 'owner_inactive')) {
    await sweepLeftovers(state, deps);
  }
}

/** Uploads the result CSV and completes the attempt; the previous result file (a retry) is removed afterwards. */
async function finish(job: Job, attempt: number, kind: BulkKind, deps: BulkDeps): Promise<BulkResult> {
  const data = resultCsv(kind, await jobRows(job, deps));
  const { id: fileId } = await deps.storage.upload({
    bucketId: job.organization_id.toLowerCase(),
    name: `${job.code}-result.csv`,
    mimeType: 'text/csv',
    data,
    metadata: { kind: kind === 'bulk_search' ? 'bulk_search_result' : 'bulk_result', bulk_job_id: job.id },
  });
  const { complete_bulk_job: done } = await deps.admin
    .request<{ complete_bulk_job: { status: string }[] }>(COMPLETE, { id: job.id, attempt, file: fileId })
    .catch(async (error: unknown) => {
      await deps.storage.deleteFile(fileId).catch(() => undefined);
      throw error;
    });
  if (done.length === 0) {
    await deps.storage.deleteFile(fileId).catch(() => undefined);
    return { job_id: job.id, stopped: 'superseded' };
  }
  if (job.result_file_id && job.result_file_id !== fileId) await deps.storage.deleteFile(job.result_file_id).catch(() => undefined);
  return { job_id: job.id, status: done[0].status };
}

/**
 * Runs one bulk job (spec §8.4 run_bulk_job): claim (queued, or running with an expired lease; attempts + 1) ->
 * input file (<= 5 MB, UTF-8 CSV, <= 10,000 records, header validated before any row) -> rows after `processed`
 * one by one (each row its own transaction; rows that already have a successful outcome are skipped) with a progress
 * update every 25 rows or 2 s -> result CSV -> completed | partial | failed. Job-level problems and unexpected errors
 * fail the attempt with the error (fenced by the attempt number); a job that stops being this worker's (cancelled,
 * reclaimed after its lease, owner deactivated) is left as is.
 */
export async function runBulkJob(id: string, deps: BulkDeps): Promise<BulkResult> {
  const { claim_bulk_job: claimed } = await deps.admin.request<{ claim_bulk_job: Job[] }>(CLAIM, { id });
  const job = claimed[0];
  if (!job) {
    await sweepAfterRefusedClaim(id, deps);
    return { job_id: id, skipped: 'not_claimed' };
  }
  const attempt = job.attempts;
  const now = deps.now ?? Date.now;
  const progress = async (total: number | null, processed: number | null): Promise<void> => {
    const { bulk_job_progress: rows } = await deps.admin.request<{ bulk_job_progress: Job[] }>(PROGRESS, {
      id,
      attempt,
      total,
      processed,
    });
    const state = rows[0];
    if (!state || state.status !== 'running' || state.attempts !== attempt) throw new JobStopped(state?.status ?? 'gone');
  };
  await sweepLeftovers(job, deps);
  try {
    if (!isBulkKind(job.kind)) throw new JobFailure(`unsupported_kind:${job.kind}`);
    const kind = job.kind;
    const { columns, records } = await loadInput(job, kind, deps);
    await progress(records.length, null);
    const done = new Set(
      (await jobRows(job, deps)).filter((r) => r.outcome !== 'failed').map((r) => r.row_no),
    );
    const ctx = { job, attempt, columns, deps };
    let since = 0;
    let last = now();
    for (let rowNo = job.processed + 1; rowNo <= records.length; rowNo += 1) {
      if (!done.has(rowNo)) await applyRow(ctx, rowNo, records[rowNo - 1]);
      since += 1;
      if (since >= PROGRESS_ROWS || now() - last >= PROGRESS_MS) {
        await progress(null, rowNo);
        since = 0;
        last = now();
      }
    }
    await progress(null, records.length);
    return await finish(job, attempt, kind, deps);
  } catch (error: unknown) {
    if (error instanceof JobStopped) {
      // A row writer refused (owner deactivated / job no longer ours): let SQL settle the job state.
      await progress(null, null).catch(() => undefined);
      return { job_id: id, stopped: error.message };
    }
    const message = error instanceof JobFailure ? error.code : errorText(error);
    const { fail_bulk_job: failed } = await deps.admin.request<{ fail_bulk_job: unknown[] }>(FAIL, { id, attempt, error: message });
    if (failed.length === 0) return { job_id: id, stopped: 'superseded' };
    return { job_id: id, status: 'failed', error: message };
  }
}
