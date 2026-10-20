import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecognitionSession, type SessionDeps } from './session.js';
import type { DetectionMessage, RecognitionDevice } from './types.js';

const DEVICE: RecognitionDevice = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  streamId: 'warehouse',
  fps: 2,
};

const message: DetectionMessage = {
  detectionId: 'd1',
  deviceId: DEVICE.id,
  identityId: 'i1',
  identityCode: 'IDENTITY-00001',
  profileId: null,
  profileName: null,
  isNewIdentity: true,
  confidence: 0.9,
  bbox: { x: 1, y: 2, width: 3, height: 4 },
  frameWidth: 640,
  frameHeight: 480,
  detectedAt: '2026-10-19T00:00:00.000Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function stubDeps(overrides: Partial<SessionDeps> = {}): SessionDeps {
  return {
    fetchSnapshot: vi.fn(async () => Buffer.from('jpeg')),
    processFrame: vi.fn(async () => ({ faces: 1, suppressed: 1, detections: [message] })),
    onDetection: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('recognition session', () => {
  it('should fetch a snapshot every 1000/fps ms and push each detection', async () => {
    const deps = stubDeps();
    const session = createRecognitionSession(DEVICE, deps);
    session.start();
    await vi.advanceTimersByTimeAsync(1000);
    session.stop();

    expect(deps.fetchSnapshot).toHaveBeenCalledTimes(2);
    expect(deps.fetchSnapshot).toHaveBeenCalledWith('warehouse');
    expect(deps.onDetection).toHaveBeenCalledTimes(2);
    expect(deps.onDetection).toHaveBeenCalledWith(message);
    const stats = session.stats();
    expect(stats).toMatchObject({
      running: false, fps: 2, framesProcessed: 2, facesDetected: 2, facesSuppressed: 2, detections: 2, lastError: null,
    });
    expect(stats.lastFrameAt).not.toBeNull();
  });

  it('should drop frames while the previous frame is still processing (per-device backpressure)', async () => {
    const gate = deferred<{ faces: number; suppressed: number; detections: DetectionMessage[] }>();
    const processFrame = vi.fn(() => gate.promise);
    const deps = stubDeps({ processFrame });
    const session = createRecognitionSession(DEVICE, deps);
    session.start();

    await vi.advanceTimersByTimeAsync(2000); // 4 ticks: the first is in flight, three are dropped
    expect(processFrame).toHaveBeenCalledTimes(1);
    expect(session.stats().framesDropped).toBe(3);

    gate.resolve({ faces: 0, suppressed: 0, detections: [] });
    await vi.advanceTimersByTimeAsync(500);
    expect(processFrame).toHaveBeenCalledTimes(2);
    session.stop();
  });

  it('should record the error and keep the loop running when a frame fails', async () => {
    const fetchSnapshot = vi
      .fn<SessionDeps['fetchSnapshot']>()
      .mockRejectedValueOnce(new Error('stream down'))
      .mockResolvedValue(Buffer.from('jpeg'));
    const deps = stubDeps({ fetchSnapshot });
    const session = createRecognitionSession(DEVICE, deps);
    session.start();

    await vi.advanceTimersByTimeAsync(500);
    expect(session.stats().lastError).toBe('stream down');
    expect(deps.log).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(session.stats()).toMatchObject({ framesProcessed: 1, lastError: null });
    session.stop();
  });

  it('should log a repeated error only once', async () => {
    const deps = stubDeps({ fetchSnapshot: vi.fn(async () => Promise.reject(new Error('stream down'))) });
    const session = createRecognitionSession(DEVICE, deps);
    session.start();
    await vi.advanceTimersByTimeAsync(2000);
    session.stop();
    expect(deps.log).toHaveBeenCalledTimes(1);
  });

  it('should not push detections when the socket publisher throws', async () => {
    const deps = stubDeps({
      onDetection: vi.fn(() => {
        throw new Error('socket gone');
      }),
    });
    const session = createRecognitionSession(DEVICE, deps);
    session.start();
    await vi.advanceTimersByTimeAsync(500);
    session.stop();
    expect(session.stats()).toMatchObject({ framesProcessed: 1, detections: 1 });
  });

  it('should abort a frame in flight on stop()', async () => {
    const gate = deferred<Buffer>();
    let seen: AbortSignal | undefined;
    const deps = stubDeps({
      fetchSnapshot: vi.fn(() => gate.promise),
      processFrame: vi.fn(async (_frame: Buffer, _at: Date, signal: AbortSignal) => {
        seen = signal;
        return { faces: 0, suppressed: 0, detections: [] };
      }),
    });
    const session = createRecognitionSession(DEVICE, deps);
    session.start();
    await vi.advanceTimersByTimeAsync(500);
    session.stop();
    gate.resolve(Buffer.from('jpeg'));
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toBeUndefined(); // a snapshot that arrives after stop() is not processed
    expect(session.stats().framesProcessed).toBe(0);
  });

  it('should stop fetching after stop()', async () => {
    const deps = stubDeps();
    const session = createRecognitionSession(DEVICE, deps);
    session.start();
    session.stop();
    await vi.advanceTimersByTimeAsync(2000);
    expect(deps.fetchSnapshot).not.toHaveBeenCalled();
    expect(session.stats().running).toBe(false);
  });
});
