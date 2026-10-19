import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRecognitionManager, type ManagerDeps } from './manager.js';
import type { RecognitionSession } from './session.js';
import type { RecognitionDevice } from './types.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const device = (id: string, fps = 2, streamId = 'lobby'): RecognitionDevice => ({ id, organizationId: ORG, streamId, fps });

function fakeSession(d: RecognitionDevice): RecognitionSession & { device: RecognitionDevice } {
  let running = false;
  return {
    device: d,
    start: vi.fn(() => {
      running = true;
    }),
    stop: vi.fn(() => {
      running = false;
    }),
    stats: () => ({
      running,
      fps: d.fps,
      framesProcessed: 0,
      framesDropped: 0,
      facesDetected: 0,
      detections: 0,
      lastFrameAt: null,
      lastError: null,
    }),
  };
}

function setup(lists: RecognitionDevice[][]) {
  const sessions: ReturnType<typeof fakeSession>[] = [];
  const listDevices = vi.fn<ManagerDeps['listDevices']>();
  for (const list of lists) listDevices.mockResolvedValueOnce(list);
  listDevices.mockResolvedValue(lists.at(-1) ?? []);
  const manager = createRecognitionManager({
    listDevices,
    createSession: (d) => {
      const s = fakeSession(d);
      sessions.push(s);
      return s;
    },
    pollMs: 10_000,
    log: vi.fn(),
  });
  return { manager, sessions, listDevices };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('recognition manager', () => {
  it('should start one session per enabled device and poll every 10 s', async () => {
    const { manager, sessions, listDevices } = setup([[device('a'), device('b')]]);
    await manager.refresh();
    expect(sessions.map((s) => s.device.id)).toEqual(['a', 'b']);
    expect(sessions.every((s) => s.stats().running)).toBe(true);

    manager.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(listDevices.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(sessions).toHaveLength(2); // unchanged devices keep their sessions
    manager.stop();
  });

  it('should stop the session of a device that was disabled or deleted', async () => {
    const { manager, sessions } = setup([[device('a'), device('b')], [device('b')]]);
    await manager.refresh();
    await manager.refresh();
    expect(sessions[0].stop).toHaveBeenCalled();
    expect(manager.status('a')).toBeUndefined();
    expect(manager.status('b')?.running).toBe(true);
  });

  it('should restart a session when its fps or stream changes', async () => {
    const { manager, sessions } = setup([[device('a', 2)], [device('a', 5)]]);
    await manager.refresh();
    await manager.refresh();
    expect(sessions).toHaveLength(2);
    expect(sessions[0].stop).toHaveBeenCalled();
    expect(manager.status('a')?.fps).toBe(5);
  });

  it('should keep running sessions when listing devices fails', async () => {
    const { manager, listDevices } = setup([[device('a')]]);
    await manager.refresh();
    listDevices.mockRejectedValueOnce(new Error('hasura down'));
    await manager.refresh();
    expect(manager.status('a')?.running).toBe(true);
  });

  it('should stop every session on stop()', async () => {
    const { manager, sessions } = setup([[device('a'), device('b')]]);
    manager.start();
    await manager.refresh();
    manager.stop();
    expect(sessions.every((s) => !s.stats().running)).toBe(true);
    expect(manager.status('a')).toBeUndefined();
  });
});

describe('recognition manager shutdown', () => {
  it('should not start sessions from a poll that finishes after stop()', async () => {
    const { manager, sessions } = setup([[device('a')]]);
    manager.start();
    manager.stop();
    await manager.refresh();
    expect(sessions).toHaveLength(0);
  });
});
