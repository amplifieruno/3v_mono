import { describe, expect, it, vi } from 'vitest';
import { deviceRoom, publishDetection, registerDeviceRooms, socketAuth, type SocketDeps, type SocketLike } from './socket.js';
import type { DetectionMessage } from './types.js';

const ORG = '22222222-2222-4222-8222-222222222222';
const DEVICE = '11111111-1111-4111-8111-111111111111';
const OTHER_DEVICE = '33333333-3333-4333-8333-333333333333';

function fakeSocket(auth: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const socket: SocketLike & { emitClient(event: string, ...args: unknown[]): Promise<unknown> } = {
    handshake: { auth, headers },
    data: {},
    join: vi.fn(),
    leave: vi.fn(),
    on: (event, handler) => {
      handlers.set(event, handler);
    },
    async emitClient(event, ...args) {
      return handlers.get(event)?.(...args);
    },
  };
  return socket;
}

const deps = (): SocketDeps => ({
  verifyToken: vi.fn((token: string) => (token === 'good' ? { userId: 'u', organizationId: ORG } : null)),
  deviceInOrganization: vi.fn(async (deviceId: string, organizationId: string) => deviceId === DEVICE && organizationId === ORG),
});

describe('recognition socket', () => {
  it('should accept a connection with a valid organization token (auth.token or Bearer header)', () => {
    const d = deps();
    const next = vi.fn();
    const socket = fakeSocket({ token: 'good' });
    socketAuth(d)(socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.organizationId).toBe(ORG);

    const viaHeader = fakeSocket({}, { authorization: 'Bearer good' });
    const next2 = vi.fn();
    socketAuth(d)(viaHeader, next2);
    expect(next2).toHaveBeenCalledWith();
  });

  it('should refuse a connection without a valid organization token', () => {
    const next = vi.fn();
    socketAuth(deps())(fakeSocket({ token: 'bad' }), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
  });

  it('should join the device room only for a device of the token organization', async () => {
    const d = deps();
    const socket = fakeSocket({ token: 'good' });
    socketAuth(d)(socket, vi.fn());
    registerDeviceRooms(socket, d);

    const ack = vi.fn();
    await socket.emitClient('join-device', DEVICE, ack);
    expect(socket.join).toHaveBeenCalledWith(deviceRoom(DEVICE));
    expect(ack).toHaveBeenCalledWith({ ok: true });

    const denied = vi.fn();
    await socket.emitClient('join-device', { deviceId: OTHER_DEVICE }, denied);
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(denied).toHaveBeenCalledWith({ ok: false, error: 'device_not_found' });

    const invalid = vi.fn();
    await socket.emitClient('join-device', 'not-a-uuid', invalid);
    expect(invalid).toHaveBeenCalledWith({ ok: false, error: 'invalid_device' });
  });

  it('should leave the device room', async () => {
    const d = deps();
    const socket = fakeSocket({ token: 'good' });
    socketAuth(d)(socket, vi.fn());
    registerDeviceRooms(socket, d);
    const ack = vi.fn();
    await socket.emitClient('leave-device', DEVICE, ack);
    expect(socket.leave).toHaveBeenCalledWith(deviceRoom(DEVICE));
    expect(ack).toHaveBeenCalledWith({ ok: true });
  });

  it('should emit a detection to its device room', () => {
    const emit = vi.fn();
    const to = vi.fn(() => ({ emit }));
    const message = { detectionId: 'd', deviceId: DEVICE } as DetectionMessage;
    publishDetection({ to }, message);
    expect(to).toHaveBeenCalledWith(`device:${DEVICE}`);
    expect(emit).toHaveBeenCalledWith('detection', message);
  });
});
