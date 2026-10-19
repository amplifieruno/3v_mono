import { createHmac, randomUUID } from 'node:crypto';
import { asAdmin, testEnv } from './clients.js';
import { runSql } from './sql.js';

/** Sending fixtures (slice 5, task 3): trigger deliveries posted to the backend, polling, and the webhook sink. */

const backendBase = `http://localhost:${process.env.BACKEND_PORT ?? 3001}`;
/** The sink as the backend container reaches itself (subscription URLs). */
export const SINK_URL = 'http://backend:3001/hasura/events/webhook-sink';

export async function postTrigger(name: string, body: unknown, secret = testEnv().ACTION_SECRET) {
  const res = await fetch(`${backendBase}/hasura/events/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-action-secret': secret },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

/** An INSERT event trigger delivery for row `id` (what Hasura sends, or redelivers with the same id). */
export function insertPayload(trigger: string, table: string, id: string, deliveryId: string = randomUUID()) {
  return {
    id: deliveryId,
    created_at: new Date().toISOString(),
    trigger: { name: trigger },
    table: { schema: 'itap', name: table },
    delivery_info: { max_retries: 10, current_retry: 0 },
    event: { op: 'INSERT', session_variables: null, data: { old: null, new: { id } } },
  };
}

export function cronPayload(name: string, scheduled = new Date()) {
  return { id: randomUUID(), name, scheduled_time: scheduled.toISOString(), payload: {}, comment: null };
}

/** Polls `read` until `done` holds (default 20 s). */
export async function waitFor<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs = 20000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`waitFor: timed out; last value ${JSON.stringify(value)}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

export type SendRow = {
  id: string;
  channel: string;
  status: string;
  attempts: number;
  deliver_after: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  error: string | null;
};
const SEND_FIELDS = 'id channel status attempts deliver_after sent_at delivered_at error';

export async function deliveryRow(id: string): Promise<SendRow | null> {
  const data = await asAdmin().request<{ notification_deliveries_by_pk: SendRow | null }>(
    `query($id: uuid!) { notification_deliveries_by_pk(id: $id) { ${SEND_FIELDS} } }`,
    { id },
  );
  return data.notification_deliveries_by_pk;
}

/** Inserts a delivery row directly (trusted SQL, as a cron would): fires the send_delivery trigger. */
export async function insertDelivery(
  orgId: string,
  ruleId: string,
  fields: { channel: string; address: string; deliverAfter?: string; content?: Record<string, unknown> },
): Promise<string> {
  const id = randomUUID();
  const deliverAfter = fields.deliverAfter ? `'${fields.deliverAfter}'` : 'NULL';
  await runSql(`insert into itap.notification_deliveries
    (id, organization_id, rule_id, event_id, recipient_address, channel, deliver_after, content)
    values ('${id}', '${orgId}', '${ruleId}', '${randomUUID()}', '${fields.address}', '${fields.channel}', ${deliverAfter},
            '${JSON.stringify(fields.content ?? { subject: 'Test', body: 'Body', title: 'Test' })}'::jsonb)`);
  return id;
}

export type WebhookRow = {
  id: string;
  subscription_id: string;
  event_id: string;
  status: string;
  attempts: number;
  response_code: number | null;
  signature: string | null;
  sent_at: string | null;
  next_attempt_at: string | null;
  error: string | null;
  body: Record<string, unknown>;
};
const WEBHOOK_FIELDS = 'id subscription_id event_id status attempts response_code signature sent_at next_attempt_at error body';

export async function webhookDeliveries(orgId: string): Promise<WebhookRow[]> {
  const data = await asAdmin().request<{ webhook_deliveries: WebhookRow[] }>(
    `query($o: uuid!) { webhook_deliveries(where: {organization_id: {_eq: $o}}, order_by: {created_at: asc}) { ${WEBHOOK_FIELDS} } }`,
    { o: orgId },
  );
  return data.webhook_deliveries;
}

export async function webhookRow(id: string): Promise<WebhookRow | null> {
  const data = await asAdmin().request<{ webhook_deliveries_by_pk: WebhookRow | null }>(
    `query($id: uuid!) { webhook_deliveries_by_pk(id: $id) { ${WEBHOOK_FIELDS} } }`,
    { id },
  );
  return data.webhook_deliveries_by_pk;
}

export type SinkRequest = { at: string; path: string; status: number; headers: Record<string, string>; body: string };

export async function sinkRequests(secret: string | null = testEnv().ACTION_SECRET): Promise<{ status: number; requests: SinkRequest[] }> {
  const headers: Record<string, string> = secret === null ? {} : { 'x-action-secret': secret };
  const res = await fetch(`${backendBase}/hasura/events/webhook-sink`, { headers });
  if (!res.ok) return { status: res.status, requests: [] };
  return { status: res.status, requests: ((await res.json()) as { requests: SinkRequest[] }).requests };
}

/** Requests the sink received for one webhook delivery. */
export async function sinkFor(deliveryId: string): Promise<SinkRequest[]> {
  return (await sinkRequests()).requests.filter((r) => r.headers['x-itap-delivery'] === deliveryId);
}

export const hmac = (secret: string, body: string): string => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

/** Seconds between two instants. */
export const secondsBetween = (from: string, to: string): number => (Date.parse(to) - Date.parse(from)) / 1000;
