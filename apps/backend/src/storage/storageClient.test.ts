import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { hangingBodyFetch, hangingFetch } from '../http/fetchStubs.js';
import { createStorageClient, StorageError } from './storageClient.js';

const env = {
  NHOST_STORAGE_URL: 'http://storage.test/v1',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  STORAGE_TIMEOUT_MS: 30_000,
} as Env;

afterEach(() => vi.unstubAllGlobals());

describe('createStorageClient timeouts', () => {
  it('should give every request an abort signal (default from STORAGE_TIMEOUT_MS)', async () => {
    const fn = vi.fn(async (url: string) =>
      url.endsWith('/presignedurl')
        ? new Response(JSON.stringify({ url: 'http://x', expiration: 60 }))
        : url.endsWith('/files')
          ? new Response(JSON.stringify({ processedFiles: [{ id: 'f1' }] }))
          : new Response('data'),
    );
    vi.stubGlobal('fetch', fn);
    const client = createStorageClient(env);
    await client.presignedUrl('f1');
    await client.deleteFile('f1');
    await client.download('f1');
    await client.upload({ bucketId: 'b', name: 'n.jpg', mimeType: 'image/jpeg', data: Buffer.from('x') });
    expect(fn).toHaveBeenCalledTimes(4);
    for (const call of fn.mock.calls as unknown as [string, RequestInit][]) {
      expect(call[1].signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('should fail with a StorageError when storage does not answer in time', async () => {
    vi.stubGlobal('fetch', hangingFetch());
    const client = createStorageClient(env, { timeoutMs: 20 });
    const error = await client.download('f1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).message).toMatch(/timed out after 20 ms/);
    await expect(client.deleteFile('f1')).rejects.toBeInstanceOf(StorageError);
    await expect(client.presignedUrl('f1')).rejects.toBeInstanceOf(StorageError);
  });

  it('should fail with a StorageError when the timeout fires during the body read', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch());
    const client = createStorageClient(env, { timeoutMs: 20 });
    for (const call of [
      () => client.download('f1'),
      () => client.presignedUrl('f1'),
      () => client.upload({ bucketId: 'b', name: 'n.jpg', mimeType: 'image/jpeg', data: Buffer.from('x') }),
    ]) {
      const error = await call().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(StorageError);
      expect((error as Error).name).toBe('StorageError');
      expect((error as StorageError).message).toMatch(/timed out after 20 ms/);
    }
  });

  it('should map a timeout while reading an error body to a StorageError', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch(500));
    const error = await createStorageClient(env, { timeoutMs: 20 }).download('f1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).status).toBe(500);
  });
});
