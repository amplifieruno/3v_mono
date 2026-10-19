import type { Env } from '../config/env.js';
import { defineCronHandler, defineEventHandler } from '../events/types.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { CLOSE_STALE_SEARCHES, DUE, type BulkDeps } from './ops.js';
import { runBulkJob } from './runner.js';

const DUE_BATCH = 10;

/** Production dependencies: rows are written as the job owner (org_admin of the job's organization). */
export function bulkDeps(env: Env, admin: HasuraClient): BulkDeps {
  const storage = createStorageClient(env);
  const insightFace = createInsightFaceClient(env.INSIGHTFACE_API_URL);
  return {
    admin,
    storage,
    asOwner: (organizationId, userId) => createHasuraClient(env, { role: 'org_admin', userId, organizationId }),
    searchAs: (organizationId, userId) => ({
      admin,
      actor: createHasuraClient(env, { role: 'admin', userId, organizationId }),
      storage,
      insightFace,
    }),
  };
}

/**
 * Runs a job in the background: a job can take minutes (10,000 rows, or one face search per row), longer than a
 * trigger delivery may wait. The worker keeps its lease alive through progress updates; if the process dies the
 * lease expires and resume_bulk_jobs continues after `processed`. Failures are recorded on the job by runBulkJob.
 */
function start(id: string, deps: BulkDeps): void {
  void runBulkJob(id, deps).catch(() => undefined);
}

/**
 * Event trigger `run_bulk_job` (insert / status update on itap.bulk_jobs): starts a `queued` job (new, or requeued by
 * retry_bulk_job); every other row state is a no-op. Answers at once; the claim makes redeliveries no-ops.
 */
export const runBulkJobTrigger = defineEventHandler(async (payload, ctx) => {
  const row = payload.event.data.new;
  const id = row?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_job_id' };
  if (row?.status !== 'queued') return { job_id: id, skipped: 'not_queued' };
  start(id, bulkDeps(ctx.env, ctx.admin));
  return { job_id: id, started: true };
});

/**
 * Cron `resume_bulk_jobs` (every minute): first closes search requests left queued / running for over 10 minutes (a
 * worker died mid-search, bulk or not) as failed `interrupted`; then starts queued jobs the trigger left over a minute
 * and running jobs with an expired lease.
 */
export const resumeBulkJobs = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const { close_stale_search_requests: closed } = await ctx.admin.request<{ close_stale_search_requests: { id: string }[] }>(
    CLOSE_STALE_SEARCHES,
    { at: at.toISOString() },
  );
  const { due_bulk_jobs: due } = await ctx.admin.request<{ due_bulk_jobs: { id: string }[] }>(DUE, {
    at: at.toISOString(),
    limit: DUE_BATCH,
  });
  const deps = bulkDeps(ctx.env, ctx.admin);
  for (const job of due) start(job.id, deps);
  return { jobs_started: due.length, searches_interrupted: closed.length };
});
