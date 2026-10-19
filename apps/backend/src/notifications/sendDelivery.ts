import type { HasuraClient } from '../hasura/client.js';
import { consoleDeliveryLog, sendViaStub, type ChannelDelivery, type DeliveryLog } from './channels.js';

export interface DeliverySendDeps {
  admin: HasuraClient;
  log?: DeliveryLog;
}

export type DeliverySendResult = { delivery_id: string; skipped: string } | { delivery_id: string; ok: boolean; status?: string };

const CLAIM = `
  mutation ClaimNotificationDelivery($id: uuid!) {
    claim_notification_delivery(args: { p_delivery: $id }) {
      id attempts channel recipient_address recipient_user_id content
    }
  }
`;
const FINISH = `
  mutation FinishNotificationDelivery($id: uuid!, $attempt: Int!, $ok: Boolean!, $delivered: Boolean!, $error: String) {
    finish_notification_delivery(args: {
      p_delivery: $id, p_attempt: $attempt, p_ok: $ok, p_delivered: $delivered, p_error: $error
    }) { id status }
  }
`;

type Claimed = ChannelDelivery & { attempts: number };

/**
 * One attempt of a notification delivery (send_delivery trigger, retry_deliveries cron; spec §8.4). The claim is a
 * conditional UPDATE in SQL (non in_app, pending/retrying, due, not a digest item) that marks it `sent` with
 * attempts + 1, so redeliveries and concurrent handlers send it once; anything not claimable is skipped. The stub
 * result is recorded by itap.finish_notification_delivery (delivered / retrying with backoff / dead_letter).
 */
export async function sendNotificationDelivery(id: string, deps: DeliverySendDeps): Promise<DeliverySendResult> {
  const { claim_notification_delivery: rows } = await deps.admin.request<{ claim_notification_delivery: Claimed[] }>(CLAIM, { id });
  const row = rows[0];
  if (!row) return { delivery_id: id, skipped: 'not_claimed' };
  let outcome: { ok: boolean; delivered: boolean; error: string | null };
  try {
    outcome = { ok: true, delivered: sendViaStub(row, deps.log ?? consoleDeliveryLog).delivered, error: null };
  } catch (error) {
    outcome = { ok: false, delivered: false, error: error instanceof Error ? error.message : String(error) };
  }
  const finished = await deps.admin.request<{ finish_notification_delivery: { id: string; status: string }[] }>(FINISH, {
    id: row.id,
    attempt: row.attempts,
    ...outcome,
  });
  return { delivery_id: row.id, ok: outcome.ok, status: finished.finish_notification_delivery[0]?.status };
}
