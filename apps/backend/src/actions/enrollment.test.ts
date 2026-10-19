import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { ActionError, type ActionHandler } from './types.js';

const service = vi.hoisted(() => ({
  enrollForProfile: vi.fn(),
  createIdentityFromImages: vi.fn(),
  addPhotosToIdentity: vi.fn(),
}));
vi.mock('../face/enrollmentService.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../face/enrollmentService.js')>()),
  ...service,
}));
vi.mock('../storage/storageClient.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storage/storageClient.js')>()),
  createStorageClient: () => ({ download: vi.fn() }),
}));

const { EnrollmentError } = await import('../face/enrollmentService.js');
const { addIdentityPhotos, createIdentityFromPhotos, enrollFace, MAX_PHOTOS } = await import('./enrollment.js');

const env = { INSIGHTFACE_API_URL: 'http://insightface.test' } as Env;
const ORG = '22222222-2222-4222-8222-222222222222';
const PROFILE = '55555555-5555-4555-8555-555555555555';
const FILE = '44444444-4444-4444-8444-444444444444';
const IDENTITY = '66666666-6666-4666-8666-666666666666';

function run(
  handler: ActionHandler<unknown, unknown>,
  input: unknown,
  { bucket = ORG, organizationId = ORG as string | null, metadata = null as unknown } = {},
) {
  const adminRequest = vi.fn(async () => ({ files: [{ id: FILE, bucketId: bucket, mimeType: 'image/jpeg', size: 10, metadata, isUploaded: true }] }));
  const client = { request: adminRequest } as unknown as HasuraClient;
  return handler({
    env,
    input,
    session: { role: 'org_admin', userId: 'u', ...(organizationId ? { organizationId } : {}) },
    admin: client,
    asCaller: client,
    actor: client,
  });
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

const outcome = { identityId: IDENTITY, identityCode: 'IDENTITY-00001', photosAdded: 1, templates: 1, rejected: [{ ref: FILE, reason: 'no_face' }] };

beforeEach(() => {
  vi.resetAllMocks();
  service.enrollForProfile.mockResolvedValue(outcome);
  service.createIdentityFromImages.mockResolvedValue(outcome);
  service.addPhotosToIdentity.mockResolvedValue(outcome);
});

describe('enrollment actions', () => {
  it('should map the service outcome to EnrollmentResult', async () => {
    expect(await run(enrollFace, { profile_id: PROFILE, file_ids: [FILE] })).toEqual({
      identity_id: IDENTITY,
      identity_code: 'IDENTITY-00001',
      photos_added: 1,
      templates: 1,
      rejected: [{ file_id: FILE, reason: 'no_face' }],
    });
    const [deps, input] = service.enrollForProfile.mock.calls[0] as [{ organizationId: string }, { profileId: string; photos: { ref: string }[] }];
    expect(deps.organizationId).toBe(ORG);
    expect(input.profileId).toBe(PROFILE);
    expect(input.photos.map((p) => p.ref)).toEqual([FILE]);
  });

  it('should deduplicate file ids', async () => {
    await run(addIdentityPhotos, { identity_id: IDENTITY, file_ids: [FILE, FILE.toUpperCase()] });
    const [, input] = service.addPhotosToIdentity.mock.calls[0] as [unknown, { photos: unknown[] }];
    expect(input.photos).toHaveLength(1);
  });

  it('should reject empty and oversized file lists as invalid_input', async () => {
    expect(await errorCode(run(enrollFace, { profile_id: PROFILE, file_ids: [] }))).toBe('invalid_input');
    const many = Array.from({ length: MAX_PHOTOS + 1 }, (_, i) => `44444444-4444-4444-8444-${String(i).padStart(12, '0')}`);
    expect(await errorCode(run(createIdentityFromPhotos, { file_ids: many }))).toBe('invalid_input');
  });

  it('should require an organization session', async () => {
    expect(await errorCode(run(enrollFace, { profile_id: PROFILE, file_ids: [FILE] }, { organizationId: null }))).toBe(
      'no_organization',
    );
  });

  it('should answer file_not_found for a file outside the organization bucket without calling the service', async () => {
    const code = await errorCode(run(enrollFace, { profile_id: PROFILE, file_ids: [FILE] }, { bucket: 'other-org' }));
    expect(code).toBe('file_not_found');
    expect(service.enrollForProfile).not.toHaveBeenCalled();
  });

  it('should answer file_not_found for a sensitive file kind without calling the service', async () => {
    for (const kind of ['profile_document', 'dsr_export', 'auth_capture']) {
      const code = await errorCode(run(enrollFace, { profile_id: PROFILE, file_ids: [FILE] }, { metadata: { kind } }));
      expect(code).toBe('file_not_found');
    }
    expect(service.enrollForProfile).not.toHaveBeenCalled();
    // A regular own-bucket file of another kind is accepted.
    await run(enrollFace, { profile_id: PROFILE, file_ids: [FILE] }, { metadata: { kind: 'identity_photo' } });
    expect(service.enrollForProfile).toHaveBeenCalledTimes(1);
  });

  it('should pass service refusals through with their code and message', async () => {
    service.createIdentityFromImages.mockRejectedValue(new EnrollmentError('duplicate_identity', 'IDENTITY-00007'));
    const error = await run(createIdentityFromPhotos, { file_ids: [FILE], attributes: { note: 'x' } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ActionError);
    expect(error).toMatchObject({ code: 'duplicate_identity', message: 'IDENTITY-00007' });
  });
});
