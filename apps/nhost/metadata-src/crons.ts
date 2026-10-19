import type { CronSpec } from './types.js';

/**
 * Hasura cron triggers (design §8.3); `metadata:generate` writes them to `cron_triggers.yaml`. Each is handled by the
 * backend at `/hasura/events/<name>` (apps/backend/src/events), which calls SQL functions per organization.
 */
export const crons: CronSpec[] = [
  {
    // Wiring/health proof for the cron pipeline: the handler records nothing and answers ok.
    name: 'heartbeat',
    schedule: '*/5 * * * *',
    includeInMetadata: true,
    comment: 'Cron pipeline health check; the backend handler writes nothing',
  },
  {
    // Real probes of the stream-server per active camera (apps/backend/src/events/deviceHealthCheck.ts). A run older
    // than 2 minutes is stale (the next one is due), so Hasura drops it instead of delivering it late.
    name: 'device_health_check',
    schedule: '* * * * *',
    toleranceSeconds: 120,
    includeInMetadata: true,
    comment: 'Probe the stream-server per camera: metrics, health_status, last_seen_at, device_events',
  },
];
