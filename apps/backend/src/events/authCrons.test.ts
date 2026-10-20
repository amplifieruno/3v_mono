import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';
import { sweepAuthEvidence } from './authCrons.js';

const admin = (files: string[], referenced: string[] = []) =>
  ({
    request: async (query: string) =>
      query.includes('StaleAuthCaptures')
        ? { files: files.map((id) => ({ id })) }
        : { authentication_attempts: referenced.map((id) => ({ evidence_file_id: id })) },
  }) as unknown as HasuraClient;

afterEach(() => vi.restoreAllMocks());

describe('sweepAuthEvidence', () => {
  it('should delete every unreferenced capture even when one delete fails, counting 404 as already deleted', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleted: string[] = [];
    const storage = {
      deleteFile: async (id: string) => {
        if (id === 'gone') throw new StorageError('File delete failed (404): not found', 404);
        if (id === 'broken') throw new StorageError('File delete failed (500): boom', 500);
        deleted.push(id);
      },
    } as unknown as StorageClient;
    const count = await sweepAuthEvidence(admin(['a', 'gone', 'broken', 'b', 'kept'], ['kept']), storage, new Date());
    expect(deleted).toEqual(['a', 'b']);
    expect(count).toBe(3);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain('broken');
  });
});
