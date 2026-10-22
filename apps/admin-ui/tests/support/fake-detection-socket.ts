import type { StoredAuth } from '../../src/auth/types';
import type { DetectionMessage, DetectionSocket } from '../../src/realtime/detection-types';

/** One fake Socket.io connection: records what the hub asked and lets the test answer as the server. */
export class FakeDetectionSocket implements DetectionSocket {
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

  /** The server accepts the connection (the hub then joins its rooms). */
  connect(): void {
    this.connectHandler();
  }
  /** The server answers the join of `deviceId`. */
  answer(deviceId: string, ack: unknown = { ok: true }): void {
    const join = [...this.joins].reverse().find((entry) => entry.deviceId === deviceId);
    if (!join) throw new Error(`no join of ${deviceId}`);
    join.ack(ack);
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
export function fakeTokenStore(organizationId: string | null) {
  const listeners = new Set<() => void>();
  const snapshotOf = (org: string | null): StoredAuth => ({
    base: {
      accessToken: 'base',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
      user: { id: 'user-1', email: 'a@b.c', displayName: 'A' },
    },
    org: org ? { accessToken: `token-${org}`, expiresAt: 0, organizationId: org, role: 'org_admin' } : null,
  });
  let current = snapshotOf(organizationId);
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

/** A detection of `deviceId` as the backend pushes it. */
export const detectionOf = (deviceId: string, more: Partial<DetectionMessage> = {}): DetectionMessage => ({
  detectionId: '44444444-4444-4444-8444-444444444444',
  deviceId,
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
