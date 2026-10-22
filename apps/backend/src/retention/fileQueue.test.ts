import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';
import { drainFileDeletions, type PendingDeletion } from './fileQueue.js';

const NOW = new Date('2026-10-20T04:00:00Z');

function row(id: string, attempts = 0): PendingDeletion {
  return { id: `q-${id}`, file_id: id, attempts };
}

/** Fake admin client: the claim returns the rows (due / in-use filtering is SQL's job); records every request. */
function fakeAdmin(rows: PendingDeletion[]) {
  const calls: { query: string; variables: Record<string, unknown> | undefined }[] = [];
  const admin = {
    request: async (query: string, variables?: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (query.includes('ClaimFileDeletions')) return { claim_file_deletions: rows };
      if (query.includes('EnqueueStaleFaceSources')) return { enqueue_stale_face_sources: [{ id: 'q-face' }] };
      return {};
    },
  } as unknown as HasuraClient;
  return { admin, calls };
}

describe('drainFileDeletions', () => {
  it('should delete claimed files through the storage API, treat 404 as done and record other failures', async () => {
    const { admin, calls } = fakeAdmin([row('ok'), row('gone'), row('broken', 2)]);
    const deleted: string[] = [];
    const storage = {
      deleteFile: async (id: string) => {
        if (id === 'gone') throw new StorageError('File delete failed (404): not found', 404);
        if (id === 'broken') throw new StorageError('File delete failed (500): boom', 500);
        deleted.push(id);
      },
    } as unknown as StorageClient;

    const result = await drainFileDeletions(admin, storage, NOW, 50);
    expect(result).toEqual({ deleted: 2, failed: 1 });
    expect(deleted).toEqual(['ok']);
    expect(calls[0].variables).toEqual({ limit: 50 });
    const gone = calls.find((c) => c.query.includes('ForgetFileDeletion'));
    expect(gone?.variables).toEqual({ id: 'q-gone', file: 'gone' });
    const failed = calls.find((c) => c.query.includes('FailFileDeletion'));
    expect(failed?.variables).toMatchObject({ id: 'q-broken', attempts: 3, error: 'File delete failed (500): boom' });
  });

  it('should do nothing when nothing is due', async () => {
    const { admin, calls } = fakeAdmin([]);
    const storage = { deleteFile: async () => undefined } as unknown as StorageClient;
    expect(await drainFileDeletions(admin, storage, NOW)).toEqual({ deleted: 0, failed: 0 });
    expect(calls).toHaveLength(1);
  });
});

describe('drain_file_deletions cron', () => {
  it('should queue face sources older than an hour, then drain at most 500 files per run', async () => {
    const { drainFileDeletionsCron } = await import('./fileQueue.js');
    const { admin, calls } = fakeAdmin([]);
    const payload = { id: 'd', name: 'drain_file_deletions', scheduled_time: NOW.toISOString(), payload: {} };
    const env = { NHOST_STORAGE_URL: 'http://storage', GRAPHQL_ADMIN_SECRET: 'x' } as Env;
    const before = Date.now();
    expect(await drainFileDeletionsCron.handle(payload, { env, admin, idempotencyKey: 'k' })).toEqual({
      face_sources_queued: 1,
      files_deleted: 0,
      files_failed: 0,
    });
    expect(calls[0].query).toContain('EnqueueStaleFaceSources');
    const cutoff = Date.parse(String(calls[0].variables?.before));
    expect(before - cutoff).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(before - cutoff).toBeLessThan(61 * 60 * 1000);
    expect(calls[0].variables?.limit).toBe(500);
    expect(calls[1].variables).toEqual({ limit: 500 });
  });
});
