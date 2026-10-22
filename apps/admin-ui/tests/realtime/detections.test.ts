import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredAuth } from '../../src/auth/types';
import {
  type DetectionMessage,
  type DetectionSocket,
  type DetectionStreamState,
  openDetectionStream,
} from '../../src/realtime/detections';

/**
 * The detection stream over a fake socket: joins the device room with the organization token,
 * reconnects with a fresh token when the server drops an expired one (Review Focus 1), closes
 * the socket of the previous organization on a switch (Review Focus 2) and stops on answers that
 * no retry can change.
 */

const DEVICE = '22222222-2222-4222-8222-222222222222';
const OTHER_DEVICE = '33333333-3333-4333-8333-333333333333';

const message = (more: Partial<DetectionMessage> = {}): DetectionMessage => ({
  detectionId: '44444444-4444-4444-8444-444444444444',
  deviceId: DEVICE,
  identityId: '55555555-5555-4555-8555-555555555555',
  identityCode: 'ID-0001',
  profileId: null,
  profileName: null,
  isNewIdentity: false,
  confidence: 0.91,
  bbox: { x: 10, y: 20, width: 100, height: 120 },
  frameWidth: 1280,
  frameHeight: 720,
  detectedAt: '2026-10-22T10:00:00.000Z',
  ...more,
});

/** One fake connection: records what the service asked and lets the test answer as the server. */
class FakeSocket implements DetectionSocket {
  readonly joins: { deviceId: string; ack: (result: unknown) => void }[] = [];
  readonly leaves: string[] = [];
  closed = false;
  private connectHandler: () => void = () => undefined;
  private errorHandler: (message: string) => void = () => undefined;
  private disconnectHandler: (reason: string) => void = () => undefined;
  private detectionHandler: (payload: unknown) => void = () => undefined;

  constructor(readonly token: string) {}

  onConnect(handler: () => void): void {
    this.connectHandler = handler;
  }
  onConnectError(handler: (message: string) => void): void {
    this.errorHandler = handler;
  }
  onDisconnect(handler: (reason: string) => void): void {
    this.disconnectHandler = handler;
  }
  onDetection(handler: (payload: unknown) => void): void {
    this.detectionHandler = handler;
  }
  join(deviceId: string, ack: (result: unknown) => void): void {
    this.joins.push({ deviceId, ack });
  }
  leave(deviceId: string): void {
    this.leaves.push(deviceId);
  }
  close(): void {
    this.closed = true;
    // socket.io calls the disconnect listener on a client-side disconnect too.
    this.disconnectHandler('io client disconnect');
  }

  /** The server accepts the connection and answers the join. */
  accept(ack: unknown = { ok: true }): void {
    this.connectHandler();
    this.joins.at(-1)?.ack(ack);
  }
  refuse(message: string): void {
    this.errorHandler(message);
  }
  drop(reason: string): void {
    this.disconnectHandler(reason);
  }
  push(payload: unknown): void {
    this.detectionHandler(payload);
  }
}

/** A token store whose organization the test switches. */
function fakeStore(organizationId: string | null) {
  const listeners = new Set<() => void>();
  let current: StoredAuth = snapshotOf(organizationId);
  function snapshotOf(org: string | null): StoredAuth {
    return {
      base: {
        accessToken: 'base',
        refreshToken: 'refresh',
        expiresAt: Date.now() + 3_600_000,
        user: { id: 'user-1', email: 'a@b.c', displayName: 'A' },
      },
      org: org ? { accessToken: `token-${org}`, expiresAt: 0, organizationId: org, role: 'org_admin' } : null,
    };
  }
  return {
    snapshot: () => current,
    subscribe(listener: (change: { external: boolean }) => void) {
      const wrapped = () => listener({ external: false });
      listeners.add(wrapped);
      return () => listeners.delete(wrapped);
    },
    switchTo(org: string | null) {
      current = snapshotOf(org);
      for (const listener of [...listeners]) listener();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

function harness(tokens: readonly (string | null)[] = ['token-1', 'token-2', 'token-3', 'token-4']) {
  const sockets: FakeSocket[] = [];
  const states: DetectionStreamState[] = [];
  const detections: DetectionMessage[] = [];
  let next = 0;
  const getToken = vi.fn(async () => tokens[Math.min(next++, tokens.length - 1)] ?? null);
  const store = fakeStore('org-a');
  const stream = openDetectionStream({
    deviceId: DEVICE,
    getToken,
    onDetection: (detection) => detections.push(detection),
    onState: (state) => states.push(state),
    connect: (token) => {
      const socket = new FakeSocket(token);
      sockets.push(socket);
      return socket;
    },
    store,
    retryDelaysMs: [100, 200],
  });
  const socket = (index: number): FakeSocket => {
    const found = sockets[index];
    if (!found) throw new Error(`no socket ${index}`);
    return found;
  };
  return { sockets, socket, states, detections, getToken, store, stream };
}

/** Lets the awaited `getToken()` settle. */
const settle = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('detection stream', () => {
  it('should join the device room with the organization token and forward its detections', async () => {
    const h = harness();
    await settle();

    expect(h.socket(0).token).toBe('token-1');
    expect(h.states.at(-1)).toEqual({ status: 'connecting' });
    h.socket(0).accept();
    expect(h.socket(0).joins.map((join) => join.deviceId)).toEqual([DEVICE]);
    expect(h.states.at(-1)).toEqual({ status: 'live' });

    h.socket(0).push(message());
    h.socket(0).push(message({ deviceId: OTHER_DEVICE }));
    h.socket(0).push({ detectionId: 'broken' });
    expect(h.detections).toEqual([message()]);
    h.stream.close();
  });

  it('should reconnect with a fresh token when the server drops the expired one (Review Focus 1)', async () => {
    const h = harness();
    await settle();
    h.socket(0).accept();
    h.socket(0).push(message({ detectionId: 'a' }));

    // The server disconnects the socket when its token expires.
    h.socket(0).drop('io server disconnect');
    expect(h.states.at(-1)).toEqual({ status: 'reconnecting' });
    await vi.advanceTimersByTimeAsync(100);

    expect(h.sockets).toHaveLength(2);
    expect(h.socket(1).token).toBe('token-2');
    expect(h.getToken).toHaveBeenCalledTimes(2);
    h.socket(1).accept();
    expect(h.states.at(-1)).toEqual({ status: 'live' });
    h.socket(1).push(message({ detectionId: 'b' }));
    // The dropped socket is gone: anything it still delivers is ignored.
    h.socket(0).push(message({ detectionId: 'stale' }));
    expect(h.detections.map((d) => d.detectionId)).toEqual(['a', 'b']);
    h.stream.close();
  });

  it('should reconnect when the join is refused for an expired token', async () => {
    const h = harness();
    await settle();
    h.socket(0).accept({ ok: false, error: 'token_expired' });
    expect(h.socket(0).closed).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    expect(h.socket(1).token).toBe('token-2');
    h.socket(1).accept();
    expect(h.states.at(-1)).toEqual({ status: 'live' });
    h.stream.close();
  });

  it('should close the previous organization’s socket on a switch and reopen (Review Focus 2)', async () => {
    const h = harness();
    await settle();
    h.socket(0).accept();
    h.socket(0).push(message({ detectionId: 'org-a' }));

    h.store.switchTo('org-b');
    expect(h.socket(0).closed).toBe(true);
    h.socket(0).push(message({ detectionId: 'late-from-org-a' }));
    await settle();
    expect(h.sockets).toHaveLength(2);
    expect(h.socket(1).token).toBe('token-2');
    // The camera is not in the new organization: the server says so and the stream stops.
    h.socket(1).accept({ ok: false, error: 'device_not_found' });
    expect(h.states.at(-1)).toEqual({ status: 'failed', error: 'device-not-found' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sockets).toHaveLength(2);
    expect(h.detections.map((d) => d.detectionId)).toEqual(['org-a']);
    h.stream.close();
  });

  it('should stop when the user signs out', async () => {
    const h = harness();
    await settle();
    h.socket(0).accept();
    h.store.switchTo(null);
    expect(h.socket(0).closed).toBe(true);
    expect(h.states.at(-1)).toEqual({ status: 'failed', error: 'signed-out' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sockets).toHaveLength(1);
    h.stream.close();
  });

  it('should fail without an organization token', async () => {
    const h = harness([null]);
    await settle();
    expect(h.sockets).toHaveLength(0);
    expect(h.states.at(-1)).toEqual({ status: 'failed', error: 'signed-out' });
  });

  it('should retry a refused connection and give up after repeated refusals', async () => {
    const h = harness();
    await settle();
    h.socket(0).refuse('unauthorized');
    expect(h.states.at(-1)).toEqual({ status: 'reconnecting' });
    await vi.advanceTimersByTimeAsync(100);
    h.socket(1).refuse('unauthorized');
    await vi.advanceTimersByTimeAsync(200);
    h.socket(2).refuse('unauthorized');
    expect(h.states.at(-1)).toEqual({ status: 'failed', error: 'unauthorized' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sockets).toHaveLength(3);
  });

  it('should keep retrying a lost network connection with growing delays', async () => {
    const h = harness();
    await settle();
    h.socket(0).refuse('xhr poll error');
    await vi.advanceTimersByTimeAsync(100);
    h.socket(1).drop('transport close');
    await vi.advanceTimersByTimeAsync(199);
    expect(h.sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.sockets).toHaveLength(3);
    h.socket(2).accept();
    expect(h.states.at(-1)).toEqual({ status: 'live' });
    h.stream.close();
  });

  it('should close the socket, the timers and the store subscription on close', async () => {
    const h = harness();
    await settle();
    h.socket(0).accept();
    h.socket(0).drop('transport close');
    const states = h.states.length;
    h.stream.close();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(h.sockets).toHaveLength(1);
    expect(h.store.listenerCount).toBe(0);
    expect(h.states).toHaveLength(states);
  });

  it('should not connect when closed before the token arrives', async () => {
    const h = harness();
    h.stream.close();
    await settle();
    expect(h.sockets).toHaveLength(0);
  });
});
