import { runWithConcurrency } from '../events/deviceHealthCheck.js';
import { defineCronHandler, defineEventHandler, type TriggerContext } from '../events/types.js';
import { createStorageClient } from '../storage/storageClient.js';
import { CronError, nextRun } from './cron.js';
import { generateReport } from './generate.js';

const SCHEDULE_BATCH = 200;
const REPORT_BATCH = 20;
const REPORT_CONCURRENCY = 2;

const DUE_SCHEDULES = `
  query DueReportSchedules($at: timestamptz!, $limit: Int!) {
    report_schedules(
      where: { is_active: { _eq: true }, _or: [{ next_run_at: { _is_null: true } }, { next_run_at: { _lte: $at } }] }
      order_by: [{ next_run_at: asc_nulls_first }, { id: asc }]
      limit: $limit
    ) { id organization_id cron timezone next_run_at }
  }
`;
const INIT = `
  mutation InitReportSchedule($id: uuid!, $next: timestamptz!) {
    init_report_schedule(args: { p_schedule: $id, p_next_run_at: $next }) { id }
  }
`;
const RUN = `
  mutation RunReportSchedule($id: uuid!, $runAt: timestamptz!, $next: timestamptz!) {
    run_report_schedule(args: { p_schedule: $id, p_run_at: $runAt, p_next_run_at: $next }) { id }
  }
`;
const DUE_REPORTS = `
  query DueReports($at: timestamptz!, $limit: Int!) {
    due_reports(args: { p_at: $at, p_limit: $limit }) { id organization_id }
  }
`;

type DueSchedule = { id: string; organization_id: string; cron: string; timezone: string; next_run_at: string | null };

/** Next run strictly after `at`; `infinity` when the expression never matches or cannot be parsed (never due). */
function nextRunText(s: DueSchedule, at: Date): string {
  try {
    return nextRun(s.cron, s.timezone, at)?.toISOString() ?? 'infinity';
  } catch (error: unknown) {
    if (error instanceof CronError) return 'infinity';
    throw error;
  }
}

/**
 * Due schedules at the scheduled time: a schedule without next_run_at gets its first one; a due schedule creates
 * the report of the previous complete period before its next_run_at (SQL, one per schedule and period) and moves on
 * to the next run after `at` (missed runs are not replayed). Both SQL calls are guarded, so a retried cron run
 * changes nothing.
 */
async function runSchedules(ctx: TriggerContext, at: Date): Promise<{ initialized: number; created: number }> {
  const { report_schedules: due } = await ctx.admin.request<{ report_schedules: DueSchedule[] }>(DUE_SCHEDULES, {
    at: at.toISOString(),
    limit: SCHEDULE_BATCH,
  });
  let initialized = 0;
  let created = 0;
  for (const s of due) {
    const next = nextRunText(s, at);
    if (s.next_run_at === null) {
      const data = await ctx.admin.request<{ init_report_schedule: unknown[] }>(INIT, { id: s.id, next });
      initialized += data.init_report_schedule.length;
    } else {
      const data = await ctx.admin.request<{ run_report_schedule: unknown[] }>(RUN, { id: s.id, runAt: s.next_run_at, next });
      created += data.run_report_schedule.length;
    }
  }
  return { initialized, created };
}

/**
 * Cron `run_report_schedules` (every 15 minutes, spec §8.3): due schedules -> reports (their insert fires
 * render_report), then reports the trigger left queued for over a minute or whose generation lease expired.
 */
export const runReportSchedules = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const { initialized, created } = await runSchedules(ctx, at);
  const { due_reports: due } = await ctx.admin.request<{ due_reports: { id: string }[] }>(DUE_REPORTS, {
    at: at.toISOString(),
    limit: REPORT_BATCH,
  });
  const storage = createStorageClient(ctx.env);
  const results = await runWithConcurrency(due, REPORT_CONCURRENCY, (r) => generateReport(r.id, { admin: ctx.admin, storage }));
  return {
    schedules_initialized: initialized,
    reports_created: created,
    reports_due: due.length,
    reports_completed: results.filter((r) => 'status' in r && r.status === 'completed').length,
    reports_failed: results.filter((r) => 'status' in r && r.status === 'failed').length,
  };
});

/**
 * Event trigger `render_report` (insert / status update on itap.reports): generates a `queued` report (new, or
 * requeued by retry_report); every other row state is a no-op.
 */
export const renderReport = defineEventHandler(async (payload, ctx) => {
  const row = payload.event.data.new;
  const id = row?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_report_id' };
  if (row?.status !== 'queued') return { report_id: id, skipped: 'not_queued' };
  return generateReport(id, { admin: ctx.admin, storage: createStorageClient(ctx.env) });
});
