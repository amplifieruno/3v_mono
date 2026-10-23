import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import { ActionError, type ActionHandler } from './types.js';

const deps = vi.hoisted(() => ({
  storage: { download: vi.fn(), presignedUrl: vi.fn(), deleteFile: vi.fn(), upload: vi.fn() },
  store: { openSession: vi.fn() },
}));
const pipeline = vi.hoisted(() => ({ runAuthentication: vi.fn(), authenticationResponse: vi.fn() }));
vi.mock('../auth-service/service.js', () => ({ createAuthServiceDeps: () => deps }));
vi.mock('../auth-service/pipeline.js', () => ({ runAuthentication: pipeline.runAuthentication }));
vi.mock('../auth-service/response.js', () => ({ authenticationResponse: pipeline.authenticationResponse }));

const { ServiceError } = await import('../auth-service/errors.js');
const { authenticateFace, PROBE_FRAME_REASON, queueProbeFrames } = await import('./faceAuth.js');

const ORG = '22222222-2222-4222-8222-222222222222';
const OTHER_ORG = '33333333-3333-4333-8333-333333333333';
const APP = '55555555-5555-4555-8555-555555555555';
const USER = '77777777-7777-4777-8777-777777777777';
const OTHER_USER = '88888888-8888-4888-8888-888888888888';
const F = ['44444444-4444-4444-8444-444444444441', '44444444-4444-4444-8444-444444444442', '44444444-4444-4444-8444-444444444443'];

type FileRow = { id: string; bucketId: string; metadata: { kind?: unknown } | null; uploadedByUserId: string | null };
const own = (id: string): FileRow => ({ id, bucketId: ORG, metadata: { kind: 'search' }, uploadedByUserId: USER });

function run(files: FileRow[], input: Record<string, unknown> = {}, { queueFails = false } = {}) {
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    void variables;
    if (query.includes('AuthConsoleFiles')) return { files };
    if (query.includes('QueueProbeFrames')) {
      if (queueFails) throw new Error('hasura down');
      return { insert_pending_file_deletions: { affected_rows: 1 } };
    }
    throw new Error(`unexpected query ${query}`);
  });
  const client = { request } as unknown as HasuraClient;
  const handler = authenticateFace as ActionHandler<unknown, unknown>;
  const result = handler({
    env: {} as Env,
    input: { application_id: APP, file_ids: files.map((f) => f.id), mode: 'identification', ...input },
    session: { role: 'org_admin', userId: USER, organizationId: ORG },
    admin: client,
    asCaller: client,
    actor: client,
  });
  return { result, request };
}

function queued(request: ReturnType<typeof run>['request']): string[] {
  const call = request.mock.calls.find(([query]) => query.includes('QueueProbeFrames')) as [string, { objects: { file_id: string }[] }] | undefined;
  return call ? call[1].objects.map((o) => o.file_id) : [];
}

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(() => undefined, (e: unknown) => e);
  expect(error).toBeInstanceOf(ActionError);
  return (error as ActionError).code;
}

beforeEach(() => {
  vi.resetAllMocks();
  deps.storage.download.mockResolvedValue(Buffer.from('frame'));
  deps.store.openSession.mockResolvedValue({ id: 'session' });
  pipeline.runAuthentication.mockResolvedValue({ attempt_id: 'attempt' });
  pipeline.authenticationResponse.mockResolvedValue({
    request_id: 'r',
    session_id: 's',
    outcome: 'success',
    authenticated: true,
    confidence: 0.9,
    attack_outcome: 'passed',
    next_step: 'proceed',
  });
});

describe('authenticate_face probe frames', () => {
  it('should queue the caller own search frames after a decision', async () => {
    const { result, request } = run(F.map(own));
    expect(await result).toMatchObject({ attempt_id: 'attempt', authenticated: true });
    expect(queued(request)).toEqual(F);
    const [, variables] = request.mock.calls.find(([q]) => q.includes('QueueProbeFrames')) as [string, { objects: unknown[] }];
    expect(variables.objects[0]).toEqual({ organization_id: ORG, file_id: F[0], reason: PROBE_FRAME_REASON });
  });

  it('should queue the frames when the decision is refused', async () => {
    pipeline.runAuthentication.mockRejectedValue(new ServiceError(422, 'replayed_sequence', 'Replayed'));
    const { result, request } = run(F.map(own));
    expect(await errorCode(result)).toBe('replayed_sequence');
    expect(queued(request)).toEqual(F);
  });

  it('should queue the frames when a download fails', async () => {
    deps.storage.download.mockRejectedValue(new Error('storage down'));
    const { result, request } = run(F.map(own));
    await expect(result).rejects.toThrow('storage down');
    expect(queued(request)).toEqual(F);
  });

  it('should never queue files of other kinds', async () => {
    const photo: FileRow = { id: F[0], bucketId: ORG, metadata: { kind: 'identity_photo' }, uploadedByUserId: USER };
    const untyped: FileRow = { id: F[1], bucketId: ORG, metadata: null, uploadedByUserId: USER };
    const { result, request } = run([photo, untyped, own(F[2])]);
    await result;
    expect(queued(request)).toEqual([F[2]]);
  });

  it('should not queue anything when the files are refused', async () => {
    const foreign: FileRow = { ...own(F[0]), uploadedByUserId: OTHER_USER };
    const evidence: FileRow = { ...own(F[1]), metadata: { kind: 'auth_capture' } };
    const elsewhere: FileRow = { ...own(F[2]), bucketId: OTHER_ORG };
    for (const bad of [foreign, evidence, elsewhere]) {
      const { result, request } = run([bad, ...F.filter((id) => id !== bad.id).map(own)]);
      expect(await errorCode(result)).toBe('file_not_found');
      expect(queued(request)).toEqual([]);
    }
  });

  it('should refuse a claim in identification before reading the files', async () => {
    const { result, request } = run(F.map(own), { claimed_identity_id: 'someone' });
    expect(await errorCode(result)).toBe('invalid_input');
    expect(request).not.toHaveBeenCalled();
  });

  it('should answer even when queueing fails', async () => {
    const { result } = run(F.map(own), {}, { queueFails: true });
    expect(await result).toMatchObject({ attempt_id: 'attempt' });
  });
});

describe('queueProbeFrames', () => {
  it('should send each file once with an on-conflict no-op', async () => {
    const request = vi.fn(async () => ({}));
    await queueProbeFrames({ request } as unknown as HasuraClient, ORG, [own(F[0]), own(F[0])]);
    const [query, variables] = request.mock.calls[0] as unknown as [string, { objects: unknown[] }];
    expect(query).toContain('on_conflict: { constraint: pending_file_deletions_file_key, update_columns: [] }');
    expect(variables.objects).toHaveLength(1);
  });

  it('should send nothing without frames', async () => {
    const request = vi.fn();
    await queueProbeFrames({ request } as unknown as HasuraClient, ORG, []);
    expect(request).not.toHaveBeenCalled();
  });
});
