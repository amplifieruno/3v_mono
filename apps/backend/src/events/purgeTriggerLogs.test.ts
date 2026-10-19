import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { purgeTriggerLogs } from './purgeTriggerLogs.js';
import { defaultEventHandlers } from './router.js';

const payload = { id: 'c-1', name: 'purge_trigger_logs', scheduled_time: '2026-10-19T03:30:00Z', payload: {} };

describe('purge_trigger_logs cron', () => {
  it('should be registered under its trigger name', () => {
    expect(defaultEventHandlers.purge_trigger_logs).toBe(purgeTriggerLogs);
  });

  it('should purge once at the scheduled time and report the deleted rows per log', async () => {
    const request = vi.fn(async () => ({
      purge_trigger_logs: [
        { log: 'event_log', deleted: 7 },
        { log: 'hdb_cron_events', deleted: 2 },
      ],
    }));
    const admin = { request } as unknown as HasuraClient;
    const result = await purgeTriggerLogs.handle(payload, { env: {} as Env, admin, idempotencyKey: 'k' });
    expect(request).toHaveBeenCalledTimes(1);
    expect((request.mock.calls[0] as unknown[])[1]).toEqual({ at: '2026-10-19T03:30:00.000Z' });
    expect(result).toEqual({ deleted: { event_log: 7, hdb_cron_events: 2 } });
  });

  it('should reject an invalid scheduled_time', async () => {
    const admin = { request: vi.fn() } as unknown as HasuraClient;
    await expect(
      purgeTriggerLogs.handle({ ...payload, scheduled_time: 'nope' }, { env: {} as Env, admin, idempotencyKey: 'k' }),
    ).rejects.toThrow(/Invalid scheduled_time/);
  });
});
