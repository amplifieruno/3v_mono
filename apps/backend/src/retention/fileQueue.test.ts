import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';
import { drainFileDeletions, isDue, type PendingDeletion } from './fileQueue.js';

const NOW = new Date('2026-10-20T04:00:00Z');

function row(id: string, attempts = 0, lastAttemptAt: string | null = null): PendingDeletion {
  return { id: `q-${id}`, file_id: id, attempts, last_attempt_at: lastAttemptAt };
}

/** Fake admin client: serves the due rows and records every mutation. */
function fakeAdmin(rows: PendingDeletion[]) {
  const calls: { query: string; variables: Record<string, unknown> | undefined }[] = [];
  const admin = {
    request: async (query: string, variables?: Record<string, unknown>) => {
      calls.push({ query, variables });
      if (query.includes('PendingFileDeletions')) return { pending_file_deletions: rows };
      return {};
    },
  } as unknown as HasuraClient;
  return { admin, calls };
}

describe('isDue', () => {
  it('should treat new rows as due and back off exponentially after failures (capped)', () => {
    expect(isDue(row('a'), NOW)).toBe(true);
    expect(isDue(row('a', 1, '2026-10-20T03:59:00Z'), NOW)).toBe(false); // 2 min backoff
    expect(isDue(row('a', 1, '2026-10-20T03:57:00Z'), NOW)).toBe(true);
    expect(isDue(row('a', 9, '2026-10-20T00:00:00Z'), NOW)).toBe(false); // capped at 6 h
    expect(isDue(row('a', 9, '2026-10-19T21:00:00Z'), NOW)).toBe(true);
  });
});

describe('drainFileDeletions', () => {
  it('should delete files through the storage API, treat 404 as done and record other failures on the row', async () => {
    const { admin, calls } = fakeAdmin([row('ok'), row('gone'), row('broken', 2, '2026-10-19T00:00:00Z'), row('later', 1, '2026-10-20T03:59:30Z')]);
    const deleted: string[] = [];
    const storage = {
      deleteFile: async (id: string) => {
        if (id === 'gone') throw new StorageError('File delete failed (404): not found', 404);
        if (id === 'broken') throw new StorageError('File delete failed (500): boom', 500);
        deleted.push(id);
      },
    } as unknown as StorageClient;

    const result = await drainFileDeletions(admin, storage, NOW);
    expect(result).toEqual({ deleted: 2, failed: 1, skipped: 1 });
    expect(deleted).toEqual(['ok']);
    const gone = calls.find((c) => c.query.includes('ForgetFileDeletion'));
    expect(gone?.variables).toEqual({ id: 'q-gone', file: 'gone' });
    const failed = calls.find((c) => c.query.includes('FailFileDeletion'));
    expect(failed?.variables).toMatchObject({ id: 'q-broken', attempts: 3, error: 'File delete failed (500): boom' });
  });

  it('should do nothing when the queue is empty', async () => {
    const { admin, calls } = fakeAdmin([]);
    const storage = { deleteFile: async () => undefined } as unknown as StorageClient;
    expect(await drainFileDeletions(admin, storage, NOW)).toEqual({ deleted: 0, failed: 0, skipped: 0 });
    expect(calls).toHaveLength(1);
  });
});
