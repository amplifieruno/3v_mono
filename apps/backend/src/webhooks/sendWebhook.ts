import type { HasuraClient } from '../hasura/client.js';
import { isAbortError } from '../http/abort.js';
import { signWebhookBody } from './signature.js';
import { checkWebhookTarget, type LookupFn } from './target.js';

export type WebhookFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface WebhookSendDeps {
  admin: HasuraClient;
  fetch?: WebhookFetch;
  lookup?: LookupFn;
  timeoutMs?: number;
}

export type WebhookSendResult = { delivery_id: string; skipped: string } | { delivery_id: string; ok: boolean; status?: string };

const CLAIM = `
  mutation ClaimWebhookDelivery($id: uuid!) {
    claim_webhook_delivery(args: { p_delivery: $id }) {
      id attempts event_type body
      subscription { url secret }
    }
  }
`;
const FINISH = `
  mutation FinishWebhookDelivery(
    $id: uuid!, $attempt: Int!, $ok: Boolean!, $retryable: Boolean!, $code: Int, $signature: String, $error: String
  ) {
    finish_webhook_delivery(args: {
      p_delivery: $id, p_attempt: $attempt, p_ok: $ok, p_retryable: $retryable, p_response_code: $code,
      p_signature: $signature, p_error: $error
    }) { id status }
  }
`;

type Claimed = {
  id: string;
  attempts: number;
  event_type: string;
  body: Record<string, unknown>;
  subscription: { url: string; secret: string } | null;
};
type Outcome = { ok: boolean; retryable: boolean; code: number | null; error: string | null };

export const WEBHOOK_TIMEOUT_MS = 10_000;

async function post(url: string, body: string, headers: Record<string, string>, fetchFn: WebhookFetch, timeoutMs: number): Promise<Outcome> {
  try {
    const res = await fetchFn(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.status >= 200 && res.status < 300) return { ok: true, retryable: false, code: res.status, error: null };
    return { ok: false, retryable: true, code: res.status, error: `HTTP ${res.status}` };
  } catch (error) {
    const message = isAbortError(error) ? `timeout after ${timeoutMs} ms` : error instanceof Error ? error.message : String(error);
    return { ok: false, retryable: true, code: null, error: message };
  }
}

/**
 * One attempt of a webhook delivery (spec §8.4): claim it (attempts + 1, lease), check the target address, POST the
 * stored JSON body signed with the subscription secret (`x-itap-signature: sha256=<hex>`), 10 s timeout, no
 * redirects, then record the result (backoff / dead_letter in SQL). Not claimable (already sent, not yet due,
 * claimed concurrently, vanished) -> skipped. Hasura errors propagate (the trigger is retried).
 */
export async function sendWebhookDelivery(id: string, deps: WebhookSendDeps): Promise<WebhookSendResult> {
  const { claim_webhook_delivery: rows } = await deps.admin.request<{ claim_webhook_delivery: Claimed[] }>(CLAIM, { id });
  const row = rows[0];
  if (!row?.subscription) return { delivery_id: id, skipped: 'not_claimed' };
  const body = JSON.stringify(row.body);
  const signature = signWebhookBody(row.subscription.secret, body);
  const target = await checkWebhookTarget(row.subscription.url, deps.lookup);
  const outcome: Outcome = !('reason' in target)
    ? await post(
        row.subscription.url,
        body,
        {
          'content-type': 'application/json',
          'x-itap-event': row.event_type,
          'x-itap-delivery': row.id,
          'x-itap-signature': signature,
        },
        deps.fetch ?? fetch,
        deps.timeoutMs ?? WEBHOOK_TIMEOUT_MS,
      )
    : { ok: false, retryable: target.retryable ?? false, code: null, error: target.reason };
  const finished = await deps.admin.request<{ finish_webhook_delivery: { id: string; status: string }[] }>(FINISH, {
    id: row.id,
    attempt: row.attempts,
    ok: outcome.ok,
    retryable: outcome.retryable,
    code: outcome.code,
    signature,
    error: outcome.error,
  });
  return { delivery_id: row.id, ok: outcome.ok, status: finished.finish_webhook_delivery[0]?.status };
}
