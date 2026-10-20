import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { runOrganizationRetention, retentionCleanup } from './cron.js';

vi.mock('./fileQueue.js', () => ({ drainFileDeletions: vi.fn(async () => ({ deleted: 3, failed: 0, skipped: 0 })) }));
vi.mock('../storage/storageClient.js', () => ({ createStorageClient: vi.fn(() => ({})) }));

/** Fake admin: organizations a, b, c; `a` needs two calls, `b` fails, `c` finishes at once. */
function fakeAdmin() {
  const calls: Record<string, number> = {};
  const admin = {
    request: async (query: string, variables?: Record<string, unknown>) => {
      if (query.includes('RetentionOrganizations')) return { organizations: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
      const org = String(variables?.organization);
      calls[org] = (calls[org] ?? 0) + 1;
      expect(variables?.at).toBe('2026-10-20T03:30:00.000Z');
      if (org === 'b') throw new Error('boom');
      const status = org === 'a' && calls[org] === 1 ? 'running' : 'completed';
      return { run_retention: [{ id: `run-${org}`, status }] };
    },
  } as unknown as HasuraClient;
  return { admin, calls };
}

describe('runOrganizationRetention', () => {
  it('should call the runner again while the run is unfinished, up to the call limit', async () => {
    const { admin, calls } = fakeAdmin();
    expect(await runOrganizationRetention(admin, 'a', '2026-10-20T03:30:00.000Z')).toBe('completed');
    expect(calls.a).toBe(2);
    const stuck = {
      request: async () => ({ run_retention: [{ id: 'r', status: 'running' }] }),
    } as unknown as HasuraClient;
    expect(await runOrganizationRetention(stuck, 'x', '2026-10-20T03:30:00.000Z', 3)).toBe('running');
  });
});

describe('retentionCleanup', () => {
  it('should run every organization, drain the file queue, then fail when an organization failed', async () => {
    const { admin, calls } = fakeAdmin();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const payload = { id: 'd1', name: 'retention_cleanup', scheduled_time: '2026-10-20T03:30:00Z', payload: {} };
    await expect(
      retentionCleanup.handle(payload, { env: {} as Env, admin, idempotencyKey: 'retention_cleanup:d1' }),
    ).rejects.toThrow(/1 of 3 organizations/);
    expect(calls).toEqual({ a: 2, b: 1, c: 1 });
    const { drainFileDeletions } = await import('./fileQueue.js');
    expect(drainFileDeletions).toHaveBeenCalledTimes(1);
    errors.mockRestore();
  });
});
