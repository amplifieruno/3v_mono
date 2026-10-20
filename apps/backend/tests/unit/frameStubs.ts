import sharp from 'sharp';
import { vi } from 'vitest';
import type { AcceptedPhoto } from '../../src/face/enrollmentSteps.js';
import type { ExtractedFace } from '../../src/face/insightFaceClient.js';
import type { HasuraClient } from '../../src/hasura/client.js';
import type { FrameDeps } from '../../src/recognition/frame.js';
import { createKeyedMutex, type KeyedMutex } from '../../src/recognition/mutex.js';
import type { RecognitionDevice } from '../../src/recognition/types.js';
import type { StorageClient } from '../../src/storage/storageClient.js';

/** Stubbed dependencies of recognition/frame.ts unit tests (Hasura keyed by operation name, InsightFace, storage). */

export const DEVICE: RecognitionDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  streamId: 'warehouse',
  fps: 2,
};
export const KNOWN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const KNOWN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const NEW_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const AT = new Date('2026-10-19T10:00:00.000Z');

/** A plain 640x480 JPEG frame. */
export function makeFrame(): Promise<Buffer> {
  return sharp({ create: { width: 640, height: 480, channels: 3, background: '#888' } }).jpeg().toBuffer();
}

/** A face whose embedding's first value tags it (the stub matcher keys on it). */
export function face(tag: number, score = 0.95, box: [number, number, number, number] = [100, 100, 220, 240]): ExtractedFace {
  return { bbox: box, score, embedding: [tag, ...new Array<number>(511).fill(0)], age: 30, gender: 'female' };
}

export type Templates = { count: number; worst: number | null };
export type StubOptions = {
  matches?: Record<number, string>;
  templates?: Record<string, Templates>;
  admitTemplate?: boolean;
  /** Similarity of the best restricted / consent-withdrawn identity per face tag (match_face_suppressed). */
  suppressed?: Record<number, number>;
  /** The identity lock of the device organization (default: a fresh per-call mutex). */
  lock?: KeyedMutex;
};

export function stubs(faces: ExtractedFace[], options: StubOptions = {}) {
  const matches: Record<number, string> = options.matches ?? {};
  const lock = options.lock ?? createKeyedMutex();
  let created = 0;
  const calls: { op: string; vars: Record<string, unknown> }[] = [];
  const request = vi.fn(async (query: string, vars: Record<string, unknown> = {}) => {
    const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'unknown';
    calls.push({ op, vars });
    switch (op) {
      case 'RecognitionMatch': {
        const tag = Number(String(vars.embedding).slice(1).split(',')[0]);
        const id = matches[tag];
        return { match_face: id ? [{ identity_id: id, profile_id: id === KNOWN_A ? 'p-a' : null, similarity: 0.8 }] : [] };
      }
      case 'RecognitionSuppressed': {
        const tag = Number(String(vars.embedding).slice(1).split(',')[0]);
        const similarity = options.suppressed?.[tag];
        return { match_face_suppressed: similarity === undefined ? [] : [{ similarity }] };
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
    createIdentity: vi.fn(async (_capture: AcceptedPhoto) => {
      created += 1;
      const id = created === 1 ? NEW_ID : `${NEW_ID.slice(0, -1)}${created}`;
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { id, code: 'IDENTITY-00042', cropFileId: 'new-crop' };
    }),
    withIdentityLock: (task) => lock.run(DEVICE.organizationId, task),
    modelVersion: 'test-model',
    log: vi.fn(),
  };
  const ops = (op: string) => calls.filter((c) => c.op === op);
  return { deps, ops, storage };
}

