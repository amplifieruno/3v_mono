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
];
