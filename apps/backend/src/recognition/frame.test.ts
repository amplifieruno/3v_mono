import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import type { ExtractedFace } from '../face/insightFaceClient.js';
import type { StorageClient } from '../storage/storageClient.js';
import { processFrame, type FrameDeps } from './frame.js';
import type { RecognitionDevice } from './types.js';

const DEVICE: RecognitionDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  streamId: 'warehouse',
  fps: 2,
};
const KNOWN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KNOWN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const NEW_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const AT = new Date('2026-10-19T10:00:00.000Z');

let frame: Buffer;
beforeAll(async () => {
  frame = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#888' } }).jpeg().toBuffer();
});

/** A face whose embedding's first value tags it (the stub matcher keys on it). */
function face(tag: number, score = 0.95, box: [number, number, number, number] = [100, 100, 220, 240]): ExtractedFace {
  return { bbox: box, score, embedding: [tag, ...new Array<number>(511).fill(0)], age: 30, gender: 'female' };
}

type Templates = { count: number; worst: number | null };
type StubOptions = {
  matches?: Record<number, string>;
  templates?: Record<string, Templates>;
  admitTemplate?: boolean;
};

function stubs(faces: ExtractedFace[], options: StubOptions = {}) {
  const calls: { op: string; vars: Record<string, unknown> }[] = [];
  const request = vi.fn(async (query: string, vars: Record<string, unknown> = {}) => {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'unknown';
    calls.push({ op, vars });
    switch (op) {
      case 'RecognitionMatch': {
        const tag = Number(String(vars.embedding).slice(1).split(',')[0]);
        const id = options.matches?.[tag];
        return { match_face: id ? [{ identity_id: id, profile_id: id === KNOWN_A ? 'p-a' : null, similarity: 0.8 }] : [] };
      }
      case 'RecognitionIdentity': {
        const t = options.templates?.[String(vars.id)] ?? { count: 5, worst: 0.99 };
        return {
          identities_by_pk: {
            code: `CODE-${String(vars.id).slice(0, 1)}`,
            profile_id: vars.id === KNOWN_A ? 'p-a' : null,
            profile: vars.id === KNOWN_A ? { first_name: 'Ann', last_name: 'Lee' } : null,
            identity_embeddings_aggregate: { aggregate: { count: t.count, min: { quality_score: t.worst } } },
          },
        };
      }
      case 'RecognitionInsertDetection':
        return { insert_detections_one: { id: `det-${calls.filter((c) => c.op === op).length}` } };
      case 'RecognitionConsiderTemplate':
        return { consider_template: options.admitTemplate === false ? [] : [{ id: 'emb' }] };
      default:
        throw new Error(`unexpected op ${op}`);
    }
  });
  const storage = {
    upload: vi.fn(async () => ({ id: 'crop-file' })),
    deleteFile: vi.fn(async () => undefined),
    download: vi.fn(),
    presignedUrl: vi.fn(),
  } satisfies StorageClient;
  const deps: FrameDeps = {
    org: { request } as unknown as HasuraClient,
    storage,
    insightFace: { extract: vi.fn(async () => faces) },
    createIdentity: vi.fn(async () => ({ id: NEW_ID, code: 'IDENTITY-00042', cropFileId: 'new-crop' })),
    modelVersion: 'test-model',
    log: vi.fn(),
  };
  const ops = (op: string) => calls.filter((c) => c.op === op);
  return { deps, ops, storage };
}

describe('processFrame', () => {
  it('should create a camera identity for an unknown face and insert a detection with its thumbnail', async () => {
    const { deps, ops } = stubs([face(1)]);
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ quality: expect.any(Number) }),
      { deviceId: DEVICE.id, capturedAt: AT },
    );
    const [insert] = ops('RecognitionInsertDetection');
    expect(insert.vars.object).toEqual({
      organization_id: DEVICE.organizationId,
      device_id: DEVICE.id,
      identity_id: NEW_ID,
      confidence: 0.95,
      similarity: null,
      is_new_identity: true,
      bbox: { x: 100, y: 100, width: 120, height: 140 },
      frame_width: 640,
      frame_height: 480,
      quality_score: expect.any(Number),
      thumbnail_file_id: 'new-crop',
      detected_at: AT.toISOString(),
    });
    expect(result.faces).toBe(1);
    expect(result.detections).toEqual([
      {
        detectionId: 'det-1',
        deviceId: DEVICE.id,
        identityId: NEW_ID,
        identityCode: 'IDENTITY-00042',
        profileId: null,
        profileName: null,
        isNewIdentity: true,
        confidence: 0.95,
        bbox: { x: 100, y: 100, width: 120, height: 140 },
        frameWidth: 640,
        frameHeight: 480,
        detectedAt: AT.toISOString(),
      },
    ]);
  });

  it('should insert a detection of a known identity without creating an identity or a thumbnail', async () => {
    const { deps, ops } = stubs([face(1)], { matches: { 1: KNOWN_A } });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).not.toHaveBeenCalled();
    const [insert] = ops('RecognitionInsertDetection');
    expect(insert.vars.object).toMatchObject({
      identity_id: KNOWN_A,
      similarity: 0.8,
      is_new_identity: false,
      thumbnail_file_id: null,
    });
    expect(result.detections[0]).toMatchObject({ identityCode: 'CODE-a', profileId: 'p-a', profileName: 'Ann Lee' });
    // Matching runs with the organization's own threshold (match_face default) and one result.
    expect(ops('RecognitionMatch')[0].vars).toEqual({ embedding: expect.stringMatching(/^\[1,0,/) });
  });

  it('should add a template only when the face beats the worst of the top five', async () => {
    const better = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: 0.1 } } });
    await processFrame(better.deps, DEVICE, frame, AT);
    const [consider] = better.ops('RecognitionConsiderTemplate');
    expect(consider.vars.args).toMatchObject({
      p_organization_id: DEVICE.organizationId,
      p_identity_id: KNOWN_A,
      p_photo_file_id: 'crop-file',
      p_device_id: DEVICE.id,
      p_source_detection_id: 'det-1',
      p_model_version: 'test-model',
      p_captured_at: AT.toISOString(),
    });
    expect(better.storage.upload).toHaveBeenCalledTimes(1);

    const worse = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: 0.99 } } });
    await processFrame(worse.deps, DEVICE, frame, AT);
    expect(worse.ops('RecognitionConsiderTemplate')).toHaveLength(0);
    expect(worse.storage.upload).not.toHaveBeenCalled();
  });

  it('should add a template while the identity has fewer than five', async () => {
    const { deps, ops } = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 2, worst: 0.99 } } });
    await processFrame(deps, DEVICE, frame, AT);
    expect(ops('RecognitionConsiderTemplate')).toHaveLength(1);
  });

  it('should delete the uploaded crop when SQL refuses the template', async () => {
    const { deps, storage } = stubs([face(1)], {
      matches: { 1: KNOWN_A },
      templates: { [KNOWN_A]: { count: 5, worst: 0.1 } },
      admitTemplate: false,
    });
    await processFrame(deps, DEVICE, frame, AT);
    expect(storage.deleteFile).toHaveBeenCalledWith('crop-file');
  });

  it('should keep the detection and log when the template update fails', async () => {
    const { deps, storage } = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 1, worst: 0.9 } } });
    storage.upload.mockRejectedValueOnce(new Error('storage down'));
    const result = await processFrame(deps, DEVICE, frame, AT);
    expect(result.detections).toHaveLength(1);
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('storage down'));
  });

  it('should insert detections one per statement sorted by identity id, unidentified faces last', async () => {
    const lowQuality = face(9, 0.55, [10, 10, 20, 20]); // tiny, barely detected: no identity is created
    const { deps, ops } = stubs([face(1, 0.9), lowQuality, face(2, 0.8)], { matches: { 1: KNOWN_B, 2: KNOWN_A } });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(deps.createIdentity).not.toHaveBeenCalled();
    expect(ops('RecognitionInsertDetection').map((c) => (c.vars.object as { identity_id: string | null }).identity_id)).toEqual([
      KNOWN_A,
      KNOWN_B,
      null,
    ]);
    expect(result.faces).toBe(3);
  });

  it('should process at most five faces per frame (highest detector score first)', async () => {
    const faces = [0.6, 0.9, 0.7, 0.95, 0.8, 0.65, 0.85].map((score, i) => face(i + 1, score));
    const matches = Object.fromEntries(faces.map((_, i) => [i + 1, KNOWN_A]));
    const { deps, ops } = stubs(faces, { matches });
    const result = await processFrame(deps, DEVICE, frame, AT);

    expect(result.faces).toBe(7);
    const confidences = ops('RecognitionInsertDetection').map((c) => (c.vars.object as { confidence: number }).confidence);
    expect(confidences.sort()).toEqual([0.8, 0.85, 0.9, 0.95, 0.7].sort());
  });

  it('should insert nothing for a frame without faces', async () => {
    const { deps, ops } = stubs([]);
    const result = await processFrame(deps, DEVICE, frame, AT);
    expect(result).toEqual({ faces: 0, detections: [] });
    expect(ops('RecognitionInsertDetection')).toHaveLength(0);
  });
});

describe('processFrame abort', () => {
  it('should write nothing when the session stopped before the faces were matched', async () => {
    const { deps, ops } = stubs([face(1)]);
    const controller = new AbortController();
    controller.abort();
    const result = await processFrame(deps, DEVICE, frame, AT, controller.signal);
    expect(result.detections).toEqual([]);
    expect(ops('RecognitionMatch')).toHaveLength(0);
    expect(ops('RecognitionInsertDetection')).toHaveLength(0);
  });
});
