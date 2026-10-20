import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import type { CronTriggerPayload, EventTriggerPayload } from '../events/types.js';
import { dsrMaintenance, fulfilDsrTrigger } from './handlers.js';

const env = { NHOST_STORAGE_URL: 'http://storage.test/v1', GRAPHQL_ADMIN_SECRET: 's' } as Env;

function ctx(request: (query: string) => unknown) {
  return { env, admin: { request: vi.fn(async (q: string) => request(q)) } as unknown as HasuraClient, idempotencyKey: 'k' };
}

const cron = (scheduled: string): CronTriggerPayload => ({ id: 'c1', name: 'dsr_maintenance', scheduled_time: scheduled, payload: {} });

describe('dsr handlers', () => {
  it('should run due requests and emit overdue events at the scheduled time', async () => {
    const c = ctx((q) => {
      if (q.includes('due_dsrs')) return { due_dsrs: [{ id: 'r1' }] };
      if (q.includes('claim_dsr')) return { claim_dsr: [] };
      if (q.includes('dsr_overdue_events')) return { dsr_overdue_events: [{ id: 'r2' }, { id: 'r3' }] };
      throw new Error(q);
    });
    expect(await dsrMaintenance.handle(cron('2026-10-20T10:00:00Z'), c)).toEqual({ requests_due: 1, requests_failed: 0, overdue_events: 2 });
    expect(vi.mocked(c.admin.request).mock.calls[0][1]).toEqual({ at: '2026-10-20T10:00:00.000Z', limit: 20 });
    await expect(dsrMaintenance.handle(cron('nope'), c)).rejects.toThrow('Invalid scheduled_time');
  });

  it('should ignore a trigger payload without a request id', async () => {
    const payload = {
      id: 'e1',
      trigger: { name: 'fulfil_dsr' },
      table: { schema: 'itap', name: 'data_subject_requests' },
      event: { op: 'INSERT', session_variables: null, data: { old: null, new: {} } },
    } as EventTriggerPayload;
    expect(await fulfilDsrTrigger.handle(payload, ctx(() => ({})))).toEqual({ skipped: 'no_request_id' });
  });
});
