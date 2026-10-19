import { sendNotificationDelivery } from '../notifications/sendDelivery.js';
import { sendWebhookDelivery } from '../webhooks/sendWebhook.js';
import { runWithConcurrency } from './deviceHealthCheck.js';
import { defineCronHandler, defineEventHandler, type CronTriggerPayload, type TriggerContext } from './types.js';

const BATCH = 50;
const CONCURRENCY = 5;

const DUE_DELIVERIES = `
  query DueNotificationDeliveries($at: timestamptz!, $limit: Int!) {
    due_notification_deliveries(args: { p_at: $at, p_limit: $limit }) { id }
  }
`;
const DUE_WEBHOOKS = `
  query DueWebhookDeliveries($at: timestamptz!, $limit: Int!) {
    due_webhook_deliveries(args: { p_at: $at, p_limit: $limit }) { id }
  }
`;

function rowId(data: Record<string, unknown> | null): string | null {
  const id = data?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

function scheduledAt(payload: CronTriggerPayload): string {
  const at = new Date(payload.scheduled_time);
  if (Number.isNaN(at.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  return at.toISOString();
}

/**
 * Sends every due row (at most BATCH per run, oldest first; the next run takes the rest). Each row is claimed in SQL,
 * so a row also taken by its trigger or a concurrent run is skipped. Any Hasura failure fails the run (Hasura retries).
 */
async function sendDue(
  ctx: TriggerContext,
  query: string,
  field: string,
  at: string,
  send: (id: string) => Promise<object>,
): Promise<{ due: number; sent: number; failed: number }> {
  const data = await ctx.admin.request<Record<string, { id: string }[]>>(query, { at, limit: BATCH });
  const ids = (data[field] ?? []).map((r) => r.id);
  const results = await runWithConcurrency(ids, CONCURRENCY, (id) =>
    send(id).then((r) => ('skipped' in r ? 'skipped' : 'sent'), () => 'failed' as const),
  );
  const failed = results.filter((r) => r === 'failed').length;
  if (failed > 0) throw new Error(`${field}: ${failed} of ${ids.length} rows failed`);
  return { due: ids.length, sent: results.filter((r) => r === 'sent').length, failed };
}

/** Event trigger `send_delivery` (insert on itap.notification_deliveries). */
export const sendDelivery = defineEventHandler(async (payload, ctx) => {
  const id = rowId(payload.event.data.new);
  if (!id) return { skipped: 'no_delivery_id' };
  return sendNotificationDelivery(id, { admin: ctx.admin });
});

/** Event trigger `send_webhook` (insert on itap.webhook_deliveries). */
export const sendWebhook = defineEventHandler(async (payload, ctx) => {
  const id = rowId(payload.event.data.new);
  if (!id) return { skipped: 'no_delivery_id' };
  return sendWebhookDelivery(id, { admin: ctx.admin });
});

/** Cron `retry_deliveries` (every minute): retrying notification deliveries whose backoff passed. */
export const retryDeliveries = defineCronHandler(async (payload, ctx) =>
  sendDue(ctx, DUE_DELIVERIES, 'due_notification_deliveries', scheduledAt(payload), (id) =>
    sendNotificationDelivery(id, { admin: ctx.admin }),
  ),
);

/** Cron `retry_webhooks` (every minute): webhook deliveries whose next_attempt_at passed (or never attempted). */
export const retryWebhooks = defineCronHandler(async (payload, ctx) =>
  sendDue(ctx, DUE_WEBHOOKS, 'due_webhook_deliveries', scheduledAt(payload), (id) =>
    sendWebhookDelivery(id, { admin: ctx.admin }),
  ),
);
