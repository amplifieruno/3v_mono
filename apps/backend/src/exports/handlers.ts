import { defineCronHandler, defineEventHandler, type TriggerContext } from '../events/types.js';
import { CronError, nextRun } from '../reports/cron.js';
import { errorText } from '../reports/generate.js';
import { createStorageClient } from '../storage/storageClient.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { runExport } from './run.js';

const SCHEDULE_BATCH = 200;
const JOB_BATCH = 20;
const CONCURRENCY = 2;

const DUE_DEFINITIONS = `
  query DueExportDefinitions($at: timestamptz!, $limit: Int!) {
    export_definitions(
      where: {
        is_active: { _eq: true }
        schedule_cron: { _is_null: false }
        _or: [{ next_run_at: { _is_null: true } }, { next_run_at: { _lte: $at } }]
      }
      order_by: [{ next_run_at: asc_nulls_first }, { id: asc }]
      limit: $limit
    ) { id organization_id schedule_cron timezone next_run_at }
  }
`;
const INIT = `
  mutation InitExportDefinition($id: uuid!, $next: timestamptz!) {
    init_export_definition(args: { p_definition: $id, p_next: $next }) { id }
  }
`;
const RUN = `
  mutation RunExportDefinition($id: uuid!, $runAt: timestamptz!, $next: timestamptz!) {
    run_export_definition(args: { p_definition: $id, p_run_at: $runAt, p_next: $next }) { id }
  }
`;
const RECORD_FAILURE = `
  mutation RecordExportDefinitionFailure($id: uuid!, $runAt: timestamptz, $next: timestamptz!, $error: String!) {
    record_export_definition_failure(args: { p_definition: $id, p_run_at: $runAt, p_next: $next, p_error: $error }) { id }
  }
`;
const DUE_JOBS = `
  query DueExportJobs($at: timestamptz!, $limit: Int!) { due_export_jobs(args: { p_at: $at, p_limit: $limit }) { id organization_id } }
`;

type DueDefinition = { id: string; organization_id: string; schedule_cron: string; timezone: string; next_run_at: string | null };

function nextRunText(d: DueDefinition, at: Date): string {
  try {
    return nextRun(d.schedule_cron, d.timezone, at)?.toISOString() ?? 'infinity';
  } catch (error: unknown) {
    if (error instanceof CronError) return 'infinity';
    throw error;
  }
}

/**
 * Due definitions at the scheduled time: the first run sets next_run_at; a due one creates a `schedule` job as its
 * owner (SQL, guarded by next_run_at under a row lock; an owner who left -> last_error owner_not_member). Failures
 * are isolated and recorded on the definition (which moves on to its next run).
 */
async function runSchedules(ctx: TriggerContext, at: Date): Promise<{ initialized: number; created: number; failed: number; unrecorded: number }> {
  const { export_definitions: due } = await ctx.admin.request<{ export_definitions: DueDefinition[] }>(DUE_DEFINITIONS, {
    at: at.toISOString(),
    limit: SCHEDULE_BATCH,
  });
  const counts = { initialized: 0, created: 0, failed: 0, unrecorded: 0 };
  for (const d of due) {
    const next = nextRunText(d, at);
    try {
      if (d.next_run_at === null) {
        counts.initialized += (await ctx.admin.request<{ init_export_definition: unknown[] }>(INIT, { id: d.id, next })).init_export_definition.length;
      } else {
        const data = await ctx.admin.request<{ run_export_definition: unknown[] }>(RUN, { id: d.id, runAt: d.next_run_at, next });
        counts.created += data.run_export_definition.length;
      }
    } catch (error: unknown) {
      counts.failed += 1;
      await ctx.admin.request(RECORD_FAILURE, { id: d.id, runAt: d.next_run_at, next, error: errorText(error) }).catch(() => {
        counts.unrecorded += 1;
      });
    }
  }
  return counts;
}

/**
 * Cron `run_export_definitions` (every 15 minutes, spec §8.3): due scheduled definitions -> export_jobs (their insert
 * fires run_export), then jobs the trigger left queued for over a minute or whose lease expired.
 */
export const runExportDefinitions = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const schedules = await runSchedules(ctx, at);
  const { due_export_jobs: due } = await ctx.admin.request<{ due_export_jobs: { id: string }[] }>(DUE_JOBS, {
    at: at.toISOString(),
    limit: JOB_BATCH,
  });
  const storage = createStorageClient(ctx.env);
  const results = await runWithConcurrency(due, CONCURRENCY, (j) => runExport(j.id, { env: ctx.env, admin: ctx.admin, storage }));
  if (schedules.unrecorded > 0) throw new Error(`run_export_definitions: ${schedules.unrecorded} definition failures not recorded`);
  return {
    definitions_initialized: schedules.initialized,
    jobs_created: schedules.created,
    definitions_failed: schedules.failed,
    jobs_due: due.length,
    jobs_failed: results.filter((r) => 'status' in r && r.status === 'failed').length,
  };
});

/** Event trigger `run_export` (insert on itap.export_jobs; payload: ids only): runs the job. */
export const runExportTrigger = defineEventHandler(async (payload, ctx) => {
  const id = payload.event.data.new?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_job_id' };
  return runExport(id, { env: ctx.env, admin: ctx.admin, storage: createStorageClient(ctx.env) });
});
