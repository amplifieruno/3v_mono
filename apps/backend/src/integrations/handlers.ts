import { defineCronHandler, defineEventHandler, type TriggerContext } from '../events/types.js';
import { CronError, nextRun } from '../reports/cron.js';
import { createStorageClient } from '../storage/storageClient.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { runSync } from './sync.js';

const SCHEDULE_BATCH = 200;
const RUN_BATCH = 20;
const CONCURRENCY = 2;

const DUE_INTEGRATIONS = `
  query DueIntegrationSchedules($at: timestamptz!, $limit: Int!) {
    integrations(
      where: {
        config: { _has_key: "schedule_cron" }
        status: { _neq: paused }
        _or: [{ next_sync_at: { _is_null: true } }, { next_sync_at: { _lte: $at } }]
      }
      order_by: [{ next_sync_at: asc_nulls_first }, { id: asc }]
      limit: $limit
    ) { id organization_id config next_sync_at }
  }
`;
const INIT = `
  mutation InitIntegrationSchedule($id: uuid!, $next: timestamptz!) {
    init_integration_schedule(args: { p_integration: $id, p_next: $next }) { id }
  }
`;
const RUN = `
  mutation RunIntegrationSchedule($id: uuid!, $runAt: timestamptz!, $next: timestamptz!) {
    run_integration_schedule(args: { p_integration: $id, p_run_at: $runAt, p_next: $next }) { id }
  }
`;
const DUE_RUNS = `
  query DueIntegrationSyncs($at: timestamptz!, $limit: Int!) {
    due_integration_syncs(args: { p_at: $at, p_limit: $limit }) { id organization_id }
  }
`;

type DueIntegration = { id: string; organization_id: string; config: Record<string, unknown>; next_sync_at: string | null };

function nextSyncText(i: DueIntegration, at: Date): string {
  const cron = i.config.schedule_cron;
  const tz = typeof i.config.schedule_timezone === 'string' ? i.config.schedule_timezone : 'UTC';
  if (typeof cron !== 'string') return 'infinity';
  try {
    return nextRun(cron, tz, at)?.toISOString() ?? 'infinity';
  } catch (error: unknown) {
    if (error instanceof CronError) return 'infinity';
    throw error;
  }
}

/** Due schedules: first run sets next_sync_at; a due slot requests a `schedule` run (guarded in SQL, idempotent). */
async function runSchedules(ctx: TriggerContext, at: Date): Promise<{ initialized: number; created: number; failed: number }> {
  const { integrations: due } = await ctx.admin.request<{ integrations: DueIntegration[] }>(DUE_INTEGRATIONS, {
    at: at.toISOString(),
    limit: SCHEDULE_BATCH,
  });
  const counts = { initialized: 0, created: 0, failed: 0 };
  for (const i of due) {
    const next = nextSyncText(i, at);
    try {
      if (i.next_sync_at === null) {
        counts.initialized += (await ctx.admin.request<{ init_integration_schedule: unknown[] }>(INIT, { id: i.id, next })).init_integration_schedule.length;
      } else {
        const data = await ctx.admin.request<{ run_integration_schedule: unknown[] }>(RUN, { id: i.id, runAt: i.next_sync_at, next });
        counts.created += data.run_integration_schedule.length;
      }
    } catch {
      // Isolated: the next cron run retries this integration (its next_sync_at did not move).
      counts.failed += 1;
    }
  }
  return counts;
}

/**
 * Cron `run_integration_schedules` (every 15 minutes): integrations with `config.schedule_cron` get their scheduled
 * runs (the insert fires run_sync); then runs the trigger missed or whose lease expired are run again.
 */
export const runIntegrationSchedules = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const schedules = await runSchedules(ctx, at);
  const { due_integration_syncs: due } = await ctx.admin.request<{ due_integration_syncs: { id: string }[] }>(DUE_RUNS, {
    at: at.toISOString(),
    limit: RUN_BATCH,
  });
  const storage = createStorageClient(ctx.env);
  const results = await runWithConcurrency(due, CONCURRENCY, (r) => runSync(r.id, { env: ctx.env, admin: ctx.admin, storage }));
  return {
    schedules_initialized: schedules.initialized,
    runs_created: schedules.created,
    schedules_failed: schedules.failed,
    runs_due: due.length,
    runs_failed: results.filter((r) => 'status' in r && r.status === 'failed').length,
  };
});

/** Event trigger `run_sync` (insert on itap.integration_sync_runs; payload: ids only): runs the sync. */
export const runSyncTrigger = defineEventHandler(async (payload, ctx) => {
  const id = payload.event.data.new?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_run_id' };
  return runSync(id, { env: ctx.env, admin: ctx.admin, storage: createStorageClient(ctx.env) });
});
