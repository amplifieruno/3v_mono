import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDetectionHub } from '../../src/realtime/detection-hub';
import type { DetectionMessage, DetectionStreamState } from '../../src/realtime/detection-types';
import { FakeDetectionSocket, detectionOf, fakeTokenStore } from '../support/fake-detection-socket';

/**
 * Many views, one connection: the hub joins each subscribed camera's room on a single socket,
 * leaves a room with the last view of its camera, closes the socket with the last view, joins
 * every room again after a reconnect, stops one camera on a refused room and every camera on
 * repeated refusals, and starts over on "Reconnect".
 */

const A = '22222222-2222-4222-8222-00000000000a';
const B = '22222222-2222-4222-8222-00000000000b';

interface View {
  readonly states: DetectionStreamState[];
  readonly detections: DetectionMessage[];
  close(): void;
}

function harness() {
  const sockets: FakeDetectionSocket[] = [];
  let next = 0;
  const getToken = vi.fn(async () => `token-${++next}`);
  const store = fakeTokenStore('org-a');
  const hub = createDetectionHub({
    getToken,
    store,
    retryDelaysMs: [100],
    connect: (token) => {
      const socket = new FakeDetectionSocket(token);
      sockets.push(socket);
      return socket;
    },
  });
  const view = (deviceId: string): View => {
    const states: DetectionStreamState[] = [];
    const detections: DetectionMessage[] = [];
    const subscription = hub.subscribe(deviceId, {
      onState: (state) => states.push(state),
      onDetection: (message) => detections.push(message),
    });
    return { states, detections, close: () => subscription.close() };
  };
  const socket = (index: number): FakeDetectionSocket => {
    const found = sockets[index];
    if (!found) throw new Error(`no socket ${index}`);
    return found;
  };
  return { hub, view, sockets, socket, store, getToken };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detection hub', () => {
  it('should join the rooms of many cameras on one socket and route each camera’s detections', async () => {
    const h = harness();
    const a = h.view(A);
    const b = h.view(B);
    await settle();
    expect(h.sockets).toHaveLength(1);
    h.socket(0).connect();
    expect(h.socket(0).joins.map((join) => join.deviceId)).toEqual([A, B]);
    h.socket(0).answer(A);
    h.socket(0).answer(B);
    expect(a.states.at(-1)).toEqual({ status: 'live' });
    expect(b.states.at(-1)).toEqual({ status: 'live' });

    h.socket(0).push(detectionOf(A, { detectionId: 'a1' }));
    h.socket(0).push(detectionOf(B, { detectionId: 'b1' }));
    expect(a.detections.map((d) => d.detectionId)).toEqual(['a1']);
    expect(b.detections.map((d) => d.detectionId)).toEqual(['b1']);
    h.hub.close();
  });

  it('should join a camera once for two views and leave it with the last of them', async () => {
    const h = harness();
    const first = h.view(A);
    const other = h.view(B);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A);
    h.socket(0).answer(B);
    const second = h.view(A);
    expect(second.states.at(-1)).toEqual({ status: 'live' });
    expect(h.socket(0).joins.filter((join) => join.deviceId === A)).toHaveLength(1);

    h.socket(0).push(detectionOf(A, { detectionId: 'a1' }));
    expect(first.detections).toHaveLength(1);
    expect(second.detections).toHaveLength(1);

    first.close();
    expect(h.socket(0).leaves).toEqual([]);
    second.close();
    expect(h.socket(0).leaves).toEqual([A]);
    expect(h.socket(0).closed).toBe(false);
    // A room left is not delivered any more, even when the server still sends.
    h.socket(0).push(detectionOf(A, { detectionId: 'late' }));
    other.close();
    expect(h.socket(0).closed).toBe(true);
    expect(h.store.listenerCount).toBe(0);
  });

  it('should leave a room whose join is accepted after its last view closed', async () => {
    const h = harness();
    h.view(A);
    const b = h.view(B);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A);
    b.close();
    expect(h.socket(0).leaves).toEqual([]);
    // The server joined the room anyway: the hub leaves it at once.
    h.socket(0).answer(B);
    expect(h.socket(0).leaves).toEqual([B]);
    expect(b.states.at(-1)).toEqual({ status: 'connecting' });
    h.hub.close();
  });

  it('should join a camera added while connected on the same socket', async () => {
    const h = harness();
    h.view(A);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A);
    const b = h.view(B);
    expect(b.states.at(-1)).toEqual({ status: 'connecting' });
    h.socket(0).answer(B);
    expect(b.states.at(-1)).toEqual({ status: 'live' });
    expect(h.sockets).toHaveLength(1);
    h.hub.close();
  });

  it('should join every room again on the new socket after the server dropped the old one', async () => {
    const h = harness();
    const a = h.view(A);
    const b = h.view(B);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A);
    h.socket(0).answer(B);
    h.socket(0).drop('io server disconnect');
    expect(a.states.at(-1)).toEqual({ status: 'reconnecting' });
    expect(b.states.at(-1)).toEqual({ status: 'reconnecting' });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.socket(1).token).toBe('token-2');
    h.socket(1).connect();
    expect(h.socket(1).joins.map((join) => join.deviceId)).toEqual([A, B]);
    h.socket(1).answer(A);
    h.socket(1).answer(B);
    expect(a.states.at(-1)).toEqual({ status: 'live' });
    expect(b.states.at(-1)).toEqual({ status: 'live' });
    h.hub.close();
  });

  it('should stop only the camera whose room the server refused', async () => {
    const h = harness();
    const a = h.view(A);
    const b = h.view(B);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A, { ok: false, error: 'device_not_found' });
    h.socket(0).answer(B);
    expect(a.states.at(-1)).toEqual({ status: 'failed', error: 'device-not-found' });
    expect(b.states.at(-1)).toEqual({ status: 'live' });
    expect(h.socket(0).closed).toBe(false);
    // A later view of the refused camera hears the refusal without a second join.
    const again = h.view(A);
    expect(again.states.at(-1)).toEqual({ status: 'failed', error: 'device-not-found' });
    expect(h.socket(0).joins.filter((join) => join.deviceId === A)).toHaveLength(1);
    h.hub.close();
  });

  it('should stop every view after repeated refusals and start over on Reconnect', async () => {
    const h = harness();
    const a = h.view(A);
    const b = h.view(B);
    await settle();
    h.socket(0).refuse('unauthorized');
    await vi.advanceTimersByTimeAsync(100);
    h.socket(1).refuse('unauthorized');
    await vi.advanceTimersByTimeAsync(100);
    h.socket(2).refuse('unauthorized');
    expect(a.states.at(-1)).toEqual({ status: 'failed', error: 'unauthorized' });
    expect(b.states.at(-1)).toEqual({ status: 'failed', error: 'unauthorized' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sockets).toHaveLength(3);
    // A view opened now hears that live detections stopped.
    const late = h.view(A);
    expect(late.states.at(-1)).toEqual({ status: 'failed', error: 'unauthorized' });
    expect(h.sockets).toHaveLength(3);

    h.hub.reconnect();
    expect(a.states.at(-1)).toEqual({ status: 'connecting' });
    await settle();
    expect(h.sockets).toHaveLength(4);
    expect(h.socket(3).token).toBe('token-4');
    h.socket(3).connect();
    h.socket(3).answer(A);
    h.socket(3).answer(B);
    expect(a.states.at(-1)).toEqual({ status: 'live' });
    expect(b.states.at(-1)).toEqual({ status: 'live' });
    expect(late.states.at(-1)).toEqual({ status: 'live' });
    // The refusal count starts over: one refusal retries again.
    h.socket(3).refuse('unauthorized');
    expect(a.states.at(-1)).toEqual({ status: 'reconnecting' });
    h.hub.close();
  });

  it('should close the previous organization’s socket on a switch and join the rooms again', async () => {
    const h = harness();
    const a = h.view(A);
    const b = h.view(B);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A, { ok: false, error: 'device_not_found' });
    h.socket(0).answer(B);

    h.store.switchTo('org-b');
    expect(h.socket(0).closed).toBe(true);
    expect(a.states.at(-1)).toEqual({ status: 'connecting' });
    await settle();
    h.socket(1).connect();
    // The camera refused in the previous organization is tried in this one.
    expect(h.socket(1).joins.map((join) => join.deviceId)).toEqual([A, B]);
    h.socket(1).answer(A);
    expect(a.states.at(-1)).toEqual({ status: 'live' });
    h.socket(0).push(detectionOf(B, { detectionId: 'late-from-org-a' }));
    expect(b.detections).toEqual([]);
    h.hub.close();
  });

  it('should open a new socket for a view that comes after the last one closed', async () => {
    const h = harness();
    const a = h.view(A);
    await settle();
    h.socket(0).connect();
    h.socket(0).answer(A);
    a.close();
    expect(h.socket(0).closed).toBe(true);
    const again = h.view(A);
    expect(again.states.at(-1)).toEqual({ status: 'connecting' });
    await settle();
    expect(h.sockets).toHaveLength(2);
    h.socket(1).connect();
    h.socket(1).answer(A);
    expect(again.states.at(-1)).toEqual({ status: 'live' });
    h.hub.close();
  });
});
