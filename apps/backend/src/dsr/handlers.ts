import { defineCronHandler, defineEventHandler } from '../events/types.js';
import { createStorageClient } from '../storage/storageClient.js';
import { runWithConcurrency } from '../util/concurrency.js';
import { fulfilDsr } from './fulfil.js';

const DUE_LIMIT = 20;
const CONCURRENCY = 2;

const DUE = `
  query DueDsrs($at: timestamptz!, $limit: Int!) { due_dsrs(args: { p_at: $at, p_limit: $limit }) { id } }
`;
const OVERDUE = `
  mutation DsrOverdue($at: timestamptz!) { dsr_overdue_events(args: { p_at: $at }) { id } }
`;

/**
 * Event trigger `fulfil_dsr` (insert, and requeue by retry_dsr): runs the job for the request; the claim makes
 * redeliveries and concurrent runs no-ops.
 */
export const fulfilDsrTrigger = defineEventHandler(async (payload, ctx) => {
  const id = payload.event.data.new?.id;
  if (typeof id !== 'string' || id.length === 0) return { skipped: 'no_request_id' };
  return fulfilDsr(id, { admin: ctx.admin, storage: createStorageClient(ctx.env) });
});

/**
 * Cron `dsr_maintenance` (every 10 minutes): requests the trigger left received for over a minute or whose job lease
 * expired (crash, backoff after a failure) run again; then one dsr_overdue event per open request past due_at.
 */
export const dsrMaintenance = defineCronHandler(async (payload, ctx) => {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  const { due_dsrs: due } = await ctx.admin.request<{ due_dsrs: { id: string }[] }>(DUE, {
    at: at.toISOString(),
    limit: DUE_LIMIT,
  });
  const storage = createStorageClient(ctx.env);
  const results = await runWithConcurrency(due, CONCURRENCY, (r) => fulfilDsr(r.id, { admin: ctx.admin, storage }));
  const { dsr_overdue_events: overdue } = await ctx.admin.request<{ dsr_overdue_events: { id: string }[] }>(OVERDUE, {
    at: at.toISOString(),
  });
  return {
    requests_due: due.length,
    requests_failed: results.filter((r) => 'status' in r && r.status === 'failed').length,
    overdue_events: overdue.length,
  };
});
