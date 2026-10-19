import type { FunctionSpec, TableSpec } from './types.js';

/** Webhooks (spec §6.12, §8.4): org-managed subscriptions and their signed deliveries. */
export const webhookTables: TableSpec[] = [
  { name: 'webhook_delivery_statuses', isEnum: true, profile: 'none' },
  {
    // secret: writable, never selectable, redacted in audit. last_delivery_*: written by the sender.
    name: 'webhook_subscriptions',
    profile: 'tenant_crud',
    readOnlyColumns: ['last_delivery_status', 'last_delivery_at'],
    secretColumns: ['secret'],
  },
  { name: 'webhook_subscription_event_types', profile: 'tenant_crud', insertOnlyColumns: ['subscription_id'] },
  {
    // Read-only log written by Stage C and updated by the sender (not audited, high volume).
    name: 'webhook_deliveries',
    profile: 'tenant_read',
    eventTriggers: [
      {
        // Real HTTP POST (10 s timeout) with the HMAC signature; HTTP failures are retried by the retry_webhooks cron
        // (backoff in SQL), so Hasura retries only cover backend/Hasura errors.
        name: 'send_webhook',
        operations: ['insert'],
        retry: { num_retries: 5, retry_interval_seconds: 15, timeout_seconds: 30 },
      },
    ],
  },
];

const adminOnly = (name: string, exposedAs: 'query' | 'mutation', reason: string): FunctionSpec => ({
  name,
  exposedAs,
  roles: [],
  unscopedReturnReason: `admin-only: ${reason}`,
});

/** Sending state machine (claim / finish / due), escalation and digests: admin secret only, called by the handlers. */
export const sendingFunctions: FunctionSpec[] = [
  adminOnly('claim_notification_delivery', 'mutation', 'send_delivery trigger and retry_deliveries cron'),
  adminOnly('finish_notification_delivery', 'mutation', 'send_delivery trigger and retry_deliveries cron'),
  adminOnly('due_notification_deliveries', 'query', 'retry_deliveries cron across all organizations'),
  adminOnly('claim_webhook_delivery', 'mutation', 'send_webhook trigger and retry_webhooks cron'),
  adminOnly('finish_webhook_delivery', 'mutation', 'send_webhook trigger and retry_webhooks cron'),
  adminOnly('due_webhook_deliveries', 'query', 'retry_webhooks cron across all organizations'),
  adminOnly('escalate_incidents', 'mutation', 'called per organization by the escalate cron handler'),
  adminOnly('send_digests', 'mutation', 'called per organization by the send_digests cron handler'),
  // Seed only (design §9): history rows dated at their simulated time; see migration *_seed_history_notifications.
  adminOnly('seed_finalize_notifications', 'mutation', 'seed history replay (pnpm seed)'),
  adminOnly('seed_escalate_incident', 'mutation', 'seed history replay (pnpm seed)'),
];
