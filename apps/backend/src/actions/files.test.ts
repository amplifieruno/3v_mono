import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { ActionError, type ActionHandler } from './types.js';

const storage = vi.hoisted(() => ({ presignedUrl: vi.fn(), deleteFile: vi.fn(), upload: vi.fn() }));
vi.mock('../storage/storageClient.js', () => ({ createStorageClient: () => storage }));

const { deleteFile, openFile } = await import('./files.js');

const env = {} as Env;
const ORG = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const FILE = '44444444-4444-4444-8444-444444444444';
const USER = '11111111-1111-4111-8111-111111111111';

type Row = { id: string; bucketId: string; metadata: { kind?: string } | null } | null;

function run(handler: ActionHandler<unknown, unknown>, row: Row, input: unknown = { file_id: FILE }, organizationId = ORG) {
  const adminRequest = vi.fn(async () => ({ file: row }));
  const actorRequest = vi.fn(async () => ({}));
  const promise = handler({
    env,
    input,
    session: { role: 'org_admin', userId: USER, ...(organizationId ? { organizationId } : {}) },
    admin: { request: adminRequest } as unknown as HasuraClient,
    asCaller: { request: adminRequest } as unknown as HasuraClient,
    actor: { request: actorRequest } as unknown as HasuraClient,
  });
  return { promise, actorRequest };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.presignedUrl.mockResolvedValue({ url: 'http://s/f', expiresAt: new Date('2030-01-01T00:00:00Z') });
});

describe('openFile', () => {
  it('should return the URL and audit view_sensitive for a sensitive kind', async () => {
    const { promise, actorRequest } = run(openFile, { id: FILE, bucketId: ORG, metadata: { kind: 'dsr_export' } });
    expect(await promise).toEqual({ url: 'http://s/f', expires_at: '2030-01-01T00:00:00.000Z' });
    expect(actorRequest).toHaveBeenCalledWith(expect.stringContaining('view_sensitive'), { org: ORG, user: USER, file: FILE });
  });

  it('should not audit non-sensitive or kind-less files', async () => {
    for (const metadata of [{ kind: 'photo' }, null]) {
      const { promise, actorRequest } = run(openFile, { id: FILE, bucketId: ORG, metadata });
      await promise;
      expect(actorRequest).not.toHaveBeenCalled();
    }
  });

  it('should allow files in the shared org-logos bucket', async () => {
    const { promise } = run(openFile, { id: FILE, bucketId: 'org-logos', metadata: null });
    await expect(promise).resolves.toMatchObject({ url: 'http://s/f' });
  });

  it('should answer file_not_found for another bucket or a missing row without calling storage', async () => {
    expect(await errorCode(run(openFile, { id: FILE, bucketId: OTHER, metadata: null }).promise)).toBe('file_not_found');
    expect(await errorCode(run(openFile, null).promise)).toBe('file_not_found');
    expect(storage.presignedUrl).not.toHaveBeenCalled();
  });

  it('should reject invalid input and a session without an organization', async () => {
    expect(await errorCode(run(openFile, null, { file_id: 'x' }).promise)).toBe('invalid_input');
    expect(await errorCode(run(openFile, null, { file_id: FILE }, '').promise)).toBe('no_organization');
  });
});

describe('deleteFile', () => {
  it('should delete a file in the own bucket', async () => {
    const { promise } = run(deleteFile, { id: FILE, bucketId: ORG, metadata: null });
    expect(await promise).toEqual({ file_id: FILE });
    expect(storage.deleteFile).toHaveBeenCalledWith(FILE);
  });

  it('should answer file_not_found for other buckets and org-logos without deleting', async () => {
    expect(await errorCode(run(deleteFile, { id: FILE, bucketId: OTHER, metadata: null }).promise)).toBe('file_not_found');
    expect(await errorCode(run(deleteFile, { id: FILE, bucketId: 'org-logos', metadata: null }).promise)).toBe('file_not_found');
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });
});
