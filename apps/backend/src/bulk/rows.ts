import { HasuraError } from '../hasura/client.js';
import { SearchError } from '../search/options.js';
import { runSearch } from '../search/searchService.js';
import { resolveBulkOptions, rowValues } from './columns.js';
import { APPLY_PROFILE_ROW, JobStopped, RECORD_ROW, stopIfNotMine, type BulkDeps, type Job } from './ops.js';

/** Deadlock, serialization failure, lock not available: the row is retried in a new transaction. */
const TRANSIENT_STATES = new Set(['40P01', '40001', '55P03']);
/** Waits before the 1st, 2nd and 3rd retry of a row; a 4th transient error fails the attempt. */
export const ROW_RETRY_DELAYS_MS = [100, 400, 1000];

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXISTING_REQUEST = `
  query BulkSearchRequest($job: uuid!, $row: Int!) {
    search_requests(
      where: { bulk_job_id: { _eq: $job }, bulk_job_row_no: { _eq: $row }, status: { _eq: completed } }
      order_by: { created_at: desc }
      limit: 1
    ) { id }
  }
`;

export type RowContext = { job: Job; attempt: number; columns: string[]; deps: BulkDeps };

async function record(
  ctx: RowContext,
  rowNo: number,
  fields: { outcome?: 'failed' | 'skipped'; error?: string; label?: string | null; request?: string },
): Promise<void> {
  await ctx.deps.admin
    .request(RECORD_ROW, {
      id: ctx.job.id,
      attempt: ctx.attempt,
      row: rowNo,
      outcome: fields.outcome ?? null,
      error: fields.error ?? null,
      label: fields.label ?? null,
      request: fields.request ?? null,
    })
    .catch((error: unknown) => {
      throw stopIfNotMine(error);
    });
}

/** One bulk_search record: a facial search as the owner (reusing a completed request of an earlier attempt). */
async function searchRow(ctx: RowContext, rowNo: number, values: Record<string, string>): Promise<void> {
  const label = values.label ?? null;
  const image = values.image_file_id;
  if (!image) return record(ctx, rowNo, { outcome: 'failed', error: 'required:image_file_id', label });
  if (!UUID.test(image)) return record(ctx, rowNo, { outcome: 'failed', error: 'invalid_value:image_file_id', label });
  const { job } = ctx;
  const { search_requests: done } = await ctx.deps.admin.request<{ search_requests: { id: string }[] }>(EXISTING_REQUEST, {
    job: job.id,
    row: rowNo,
  });
  let request = done[0]?.id;
  if (!request) {
    const options = resolveBulkOptions(job.options);
    try {
      const outcome = await runSearch(ctx.deps.searchAs(job.organization_id, job.owner_id), {
        organizationId: job.organization_id,
        userId: job.owner_id,
        bulkJob: { id: job.id, rowNo },
        input: { searchType: 'facial', imageFileId: image, threshold: options.threshold, maxResults: options.maxResults },
      });
      request = outcome.searchRequestId;
    } catch (error: unknown) {
      if (error instanceof SearchError) return record(ctx, rowNo, { outcome: 'failed', error: error.code, label });
      // Database problems and a lost job stop or fail the attempt; anything else (InsightFace error, fetch / storage
      // failure) fails this record only, so one unreachable service call does not fail the whole job.
      if (error instanceof HasuraError || error instanceof JobStopped) throw error;
      return record(ctx, rowNo, { outcome: 'failed', error: 'search_unavailable', label });
    }
  }
  return record(ctx, rowNo, { label, request });
}

/**
 * Applies input record `rowNo` (1-based, after the header). Blank records are `skipped`, records with another field
 * count `failed` (column_count_mismatch), records with a NUL cell `failed` (invalid_value:<column>); profile records
 * go through itap.bulk_apply_profile_row as the owner (one transaction per row, idempotent per row; a deadlock,
 * serialization failure or lock timeout is retried up to 3 times after 100 / 400 / 1000 ms, then fails the attempt),
 * search records through the search core. Throws JobStopped when the job is no longer this worker's.
 */
export async function applyRow(ctx: RowContext, rowNo: number, cells: string[]): Promise<void> {
  const parsed = rowValues(ctx.columns, cells);
  if (parsed.kind === 'blank') return record(ctx, rowNo, { outcome: 'skipped' });
  if (parsed.kind === 'mismatch') return record(ctx, rowNo, { outcome: 'failed', error: 'column_count_mismatch' });
  if (parsed.kind === 'invalid') return record(ctx, rowNo, { outcome: 'failed', error: parsed.error });
  if (ctx.job.kind === 'bulk_search') return searchRow(ctx, rowNo, parsed.values);
  const owner = ctx.deps.asOwner(ctx.job.organization_id, ctx.job.owner_id);
  const sleep = ctx.deps.sleep ?? defaultSleep;
  for (let retry = 0; ; retry += 1) {
    try {
      await owner.request(APPLY_PROFILE_ROW, { id: ctx.job.id, attempt: ctx.attempt, row: rowNo, data: parsed.values });
      return;
    } catch (error: unknown) {
      const transient = error instanceof HasuraError && error.sqlState !== undefined && TRANSIENT_STATES.has(error.sqlState);
      if (!transient || retry >= ROW_RETRY_DELAYS_MS.length) throw stopIfNotMine(error);
      await sleep(ROW_RETRY_DELAYS_MS[retry]);
    }
  }
}
