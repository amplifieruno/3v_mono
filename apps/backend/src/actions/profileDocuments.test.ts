import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { ActionError, type ActionHandler } from './types.js';

const storage = vi.hoisted(() => ({ presignedUrl: vi.fn(), deleteFile: vi.fn(), upload: vi.fn() }));
vi.mock('../storage/storageClient.js', () => ({ createStorageClient: () => storage }));

const { uploadProfileDocument, MAX_DOCUMENT_BYTES } = await import('./profileDocuments.js');

const env = {} as Env;
const ORG = '22222222-2222-4222-8222-222222222222';
const PROFILE = '55555555-5555-4555-8555-555555555555';
const USER = '11111111-1111-4111-8111-111111111111';
const FILE = '44444444-4444-4444-8444-444444444444';
const DOC = '66666666-6666-4666-8666-666666666666';

const input = (overrides: Record<string, unknown> = {}) => ({
  profile_id: PROFILE,
  kind: 'contract',
  title: 'Contract 2026',
  file_name: 'contract.pdf',
  mime_type: 'application/pdf',
  content_base64: Buffer.from('hello').toString('base64'),
  ...overrides,
});

function run(
  handler: ActionHandler<unknown, unknown>,
  payload: unknown,
  { profileFound = true, organizationId = ORG as string | null } = {},
) {
  const adminRequest = vi.fn(async () => ({ profiles: profileFound ? [{ id: PROFILE }] : [] }));
  const actorRequest = vi.fn(async () => ({ insert_profile_documents_one: { id: DOC } }));
  const promise = handler({
    env,
    input: payload,
    session: { role: 'org_admin', userId: USER, ...(organizationId ? { organizationId } : {}) },
    admin: { request: adminRequest } as unknown as HasuraClient,
    asCaller: { request: adminRequest } as unknown as HasuraClient,
    actor: { request: actorRequest } as unknown as HasuraClient,
  });
  return { promise, adminRequest, actorRequest };
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

beforeEach(() => {
  vi.resetAllMocks();
  storage.upload.mockResolvedValue({ id: FILE });
  storage.deleteFile.mockResolvedValue(undefined);
});

describe('uploadProfileDocument', () => {
  it('should upload into the org bucket with the profile_document kind and insert the row via actor', async () => {
    const { promise, actorRequest } = run(uploadProfileDocument, input());
    expect(await promise).toEqual({ document_id: DOC, file_id: FILE });
    expect(storage.upload).toHaveBeenCalledWith({
      bucketId: ORG,
      name: 'contract.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from('hello'),
      metadata: { kind: 'profile_document', profile_id: PROFILE },
    });
    expect(actorRequest).toHaveBeenCalledWith(expect.stringContaining('insert_profile_documents_one'), {
      object: { organization_id: ORG, profile_id: PROFILE, file_id: FILE, kind: 'contract', title: 'Contract 2026' },
    });
  });

  it('should answer profile_not_found without uploading when the profile is not in the session organization', async () => {
    const { promise } = run(uploadProfileDocument, input(), { profileFound: false });
    expect(await errorCode(promise)).toBe('profile_not_found');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('should answer unsupported_mime_type outside the allowlist, before checking the profile or uploading', async () => {
    for (const mime of ['text/html', 'image/svg+xml', 'application/octet-stream']) {
      const { promise, adminRequest } = run(uploadProfileDocument, input({ mime_type: mime }));
      expect(await errorCode(promise)).toBe('unsupported_mime_type');
      expect(adminRequest).not.toHaveBeenCalled();
    }
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('should accept the allowlisted mime types case-insensitively and store them lowercased', async () => {
    for (const mime of ['application/pdf', 'image/png', 'image/jpeg', 'IMAGE/WEBP']) {
      const { promise } = run(uploadProfileDocument, input({ mime_type: mime }));
      await promise;
    }
    expect(storage.upload.mock.calls.map(([arg]) => (arg as { mimeType: string }).mimeType)).toEqual([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'image/webp',
    ]);
  });

  it('should answer file_too_large above 10 MB decoded, before decoding or uploading', async () => {
    const big = Buffer.alloc(MAX_DOCUMENT_BYTES + 1).toString('base64');
    const { promise, adminRequest } = run(uploadProfileDocument, input({ content_base64: big }));
    expect(await errorCode(promise)).toBe('file_too_large');
    expect(adminRequest).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('should accept exactly 10 MB', async () => {
    const exact = Buffer.alloc(MAX_DOCUMENT_BYTES).toString('base64');
    const { promise } = run(uploadProfileDocument, input({ content_base64: exact }));
    await expect(promise).resolves.toEqual({ document_id: DOC, file_id: FILE });
  });

  it.each([
    ['unknown kind', { kind: 'selfie' }],
    ['empty title', { title: '' }],
    ['non-uuid profile', { profile_id: 'x' }],
    ['non-base64 content', { content_base64: 'not base64!!' }],
    ['empty content', { content_base64: '' }],
  ])('should answer invalid_input for %s', async (_name, overrides) => {
    const { promise } = run(uploadProfileDocument, input(overrides));
    expect(await errorCode(promise)).toBe('invalid_input');
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('should require an organization session', async () => {
    const { promise } = run(uploadProfileDocument, input(), { organizationId: null });
    expect(await errorCode(promise)).toBe('no_organization');
  });

  it('should delete the uploaded file and rethrow when the row insert fails', async () => {
    const adminRequest = vi.fn(async () => ({ profiles: [{ id: PROFILE }] }));
    const actorRequest = vi.fn(async () => {
      throw new Error('insert failed');
    });
    const promise = uploadProfileDocument({
      env,
      input: input(),
      session: { role: 'org_admin', userId: USER, organizationId: ORG },
      admin: { request: adminRequest } as unknown as HasuraClient,
      asCaller: { request: adminRequest } as unknown as HasuraClient,
      actor: { request: actorRequest } as unknown as HasuraClient,
    });
    await expect(promise).rejects.toThrow('insert failed');
    expect(storage.deleteFile).toHaveBeenCalledWith(FILE);
  });
});
