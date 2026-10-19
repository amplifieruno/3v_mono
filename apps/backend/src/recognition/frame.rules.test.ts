import { beforeAll, describe, expect, it } from 'vitest';
import { AT, DEVICE, face, KNOWN_A, makeFrame, NEW_ID, stubs } from '../../tests/unit/frameStubs.js';
import { processFrame, TEMPLATE_MARGIN } from './frame.js';
import { createKeyedMutex } from './mutex.js';

let frame: Buffer;
beforeAll(async () => {
  frame = await makeFrame();
});

// face(1) in the 640x480 test frame: detector 0.95 -> 0.9, size 120x140 >= 112 px -> 1; quality 0.95.
const QUALITY = 0.95;

describe('processFrame template margin', () => {
  it('should not offer a template within the margin of the worst of five', async () => {
    const close = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: QUALITY - TEMPLATE_MARGIN + 0.01 } } });
    await processFrame(close.deps, DEVICE, frame, AT);
    expect(close.ops('RecognitionConsiderTemplate')).toHaveLength(0);
    expect(close.storage.upload).not.toHaveBeenCalled();

    const clear = stubs([face(1)], { matches: { 1: KNOWN_A }, templates: { [KNOWN_A]: { count: 5, worst: QUALITY - TEMPLATE_MARGIN - 0.01 } } });
    await processFrame(clear.deps, DEVICE, frame, AT);
    expect(clear.ops('RecognitionConsiderTemplate')).toHaveLength(1);
  });
});

describe('processFrame identity lock', () => {
  it('should create one identity when two cameras of an organization see the same unknown person at once', async () => {
    const lock = createKeyedMutex();
    const first = stubs([face(7)], { lock });
    const second = stubs([face(7)], { lock });
    const created = shareDatabase(first, second);
    const [a, b] = await Promise.all([
      processFrame(first.deps, DEVICE, frame, AT),
      processFrame(second.deps, { ...DEVICE, id: '44444444-4444-4444-8444-444444444444' }, frame, AT),
    ]);
    expect(created).toEqual([NEW_ID]);
    expect(a.detections[0].identityId).toBe(NEW_ID);
    expect(b.detections[0].identityId).toBe(NEW_ID);
    expect([a.detections[0].isNewIdentity, b.detections[0].isNewIdentity].sort()).toEqual([false, true]);
  });

  it('should create two identities without a shared lock (what the lock prevents)', async () => {
    const first = stubs([face(7)]);
    const second = stubs([face(7)]);
    const created = shareDatabase(first, second);
    await Promise.all([processFrame(first.deps, DEVICE, frame, AT), processFrame(second.deps, DEVICE, frame, AT)]);
    expect(created).toHaveLength(2);
  });
});

/** Both stubs see one "database": match_face answers from a table that either createIdentity fills. */
function shareDatabase(...all: ReturnType<typeof stubs>[]): string[] {
  const table: Record<number, string> = {};
  const created: string[] = [];
  for (const s of all) {
    const create = s.deps.createIdentity;
    s.deps.createIdentity = async (capture, options) => {
      const identity = await create(capture, options);
      table[capture.face.embedding[0]] = identity.id;
      created.push(identity.id);
      return identity;
    };
    const base = s.deps.org;
    s.deps.org = {
      async request<T>(query: string, vars?: Record<string, unknown>): Promise<T> {
        if (query.includes('RecognitionMatch')) {
          const id = table[Number(String(vars?.embedding).slice(1).split(',')[0])];
          return { match_face: id ? [{ identity_id: id, profile_id: null, similarity: 0.9 }] : [] } as T;
        }
        return base.request<T>(query, vars);
      },
    };
  }
  return created;
}

describe('processFrame abort', () => {
  it('should write nothing when the session stopped before the faces were matched', async () => {
    const { deps, ops } = stubs([face(1)]);
    const controller = new AbortController();
    controller.abort();
    const result = await processFrame(deps, DEVICE, frame, AT, controller.signal);
    expect(result.detections).toEqual([]);
    expect(ops('RecognitionMatch')).toHaveLength(0);
  });

  it('should stop matching on abort but still write the detections of faces already resolved', async () => {
    const controller = new AbortController();
    const { deps, ops } = stubs([face(1, 0.95), face(2, 0.9)]);
    const create = deps.createIdentity;
    deps.createIdentity = async (capture, options) => {
      const created = await create(capture, options);
      controller.abort(); // the session stops while the first face's identity is being created
      return created;
    };
    const result = await processFrame(deps, DEVICE, frame, AT, controller.signal);
    expect(ops('RecognitionMatch')).toHaveLength(2); // first face: match + re-match under the lock
    expect(result.detections.map((d) => d.identityId)).toEqual([NEW_ID]);
    expect(ops('RecognitionInsertDetection')).toHaveLength(1);
  });
});
