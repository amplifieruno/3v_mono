import { defineCronHandler } from './types.js';

const PURGE = `
  mutation PurgeTriggerLogs($at: timestamptz!) {
    purge_trigger_logs(args: { p_at: $at }) { log deleted }
  }
`;

/**
 * Cron `purge_trigger_logs` (daily): deletes Hasura's finished event-trigger and cron delivery logs older than
 * 3 days (itap.purge_trigger_logs, every trigger). Measured from scheduled_time, so a retry deletes nothing new.
 */
export const purgeTriggerLogs = defineCronHandler(async (payload, ctx) => {
  const scheduled = new Date(payload.scheduled_time);
  if (Number.isNaN(scheduled.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const data = await ctx.admin.request<{ purge_trigger_logs: { log: string; deleted: number }[] }>(PURGE, {
    at: scheduled.toISOString(),
  });
  return { deleted: Object.fromEntries(data.purge_trigger_logs.map((r) => [r.log, r.deleted])) };
});
