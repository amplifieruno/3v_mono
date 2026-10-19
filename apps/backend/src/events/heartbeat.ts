import { defineCronHandler } from './types.js';

/**
 * Cron `heartbeat` (every 5 minutes, metadata-src/crons.ts): proves the Hasura -> backend cron pipeline is alive.
 * Writes nothing; Hasura's cron invocation log is the record.
 */
export const heartbeat = defineCronHandler(async (payload) => ({ scheduled_time: payload.scheduled_time }));
