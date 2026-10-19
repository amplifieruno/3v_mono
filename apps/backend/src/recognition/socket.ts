import type { Server } from 'socket.io';
import { z } from 'zod';
import type { DetectionMessage } from './types.js';

/**
 * Live detection push over Socket.io (spec §7).
 *
 * Client protocol:
 * - connect with an organization token: `io(url, { auth: { token } })` (or `Authorization: Bearer <token>`);
 *   anything but a valid org token (Hasura JWT secret, role org_admin, organization claim) is refused (`unauthorized`).
 * - `join-device` (deviceId | { deviceId }, ack?) joins room `device:<id>` when the device belongs to the token's
 *   organization; ack `{ ok: true }` or `{ ok: false, error: 'invalid_device' | 'device_not_found' | 'token_expired' }`.
 * - the server disconnects the socket when its token expires; reconnect with a fresh token.
 * - `leave-device` (deviceId | { deviceId }, ack?) leaves it.
 * - server event `detection` (DetectionMessage) per committed detection of the device.
 */

export type SocketDeps = {
  verifyToken(token: string): { userId: string; organizationId: string; expiresAt: Date } | null;
  deviceInOrganization(deviceId: string, organizationId: string): Promise<boolean>;
};

/** The parts of a socket.io Socket used here (kept structural for tests). */
export type SocketLike = {
  handshake: { auth: Record<string, unknown>; headers: Record<string, string | string[] | undefined> };
  data: { organizationId?: string; expiresAt?: number };
  join(room: string): unknown;
  leave(room: string): unknown;
  disconnect(close?: boolean): unknown;
  on(event: string, handler: (...args: never[]) => unknown): unknown;
};

type Ack = (result: { ok: true } | { ok: false; error: string }) => void;

export const deviceRoom = (deviceId: string): string => `device:${deviceId}`;

const devicePayload = z.union([z.string().uuid(), z.object({ deviceId: z.string().uuid() }).transform((p) => p.deviceId)]);

function tokenOf(socket: SocketLike): string | undefined {
  const { token } = socket.handshake.auth;
  if (typeof token === 'string' && token) return token;
  const header = socket.handshake.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : undefined;
}

/** Connection middleware: only organization tokens connect; the organization is kept on `socket.data`. */
export function socketAuth(deps: SocketDeps) {
  return (socket: SocketLike, next: (error?: Error) => void): void => {
    const token = tokenOf(socket);
    const verified = token ? deps.verifyToken(token) : null;
    if (!verified) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.organizationId = verified.organizationId;
    socket.data.expiresAt = verified.expiresAt.getTime();
    next();
  };
}

/** `join-device` / `leave-device` handlers of one connection; the socket is disconnected when its token expires. */
export function registerDeviceRooms(socket: SocketLike, deps: SocketDeps): void {
  const expiresAt = socket.data.expiresAt ?? 0;
  const expired = (): boolean => Date.now() >= expiresAt;
  // setTimeout caps at ~24.8 days; org tokens live minutes.
  const timer = setTimeout(() => socket.disconnect(true), Math.min(Math.max(0, expiresAt - Date.now()), 2_147_483_647));
  socket.on('disconnect', () => clearTimeout(timer));

  const reply = (ack: unknown, result: Parameters<Ack>[0]): void => {
    if (typeof ack === 'function') (ack as Ack)(result);
  };

  socket.on('join-device', async (payload: unknown, ack?: unknown) => {
    const parsed = devicePayload.safeParse(payload);
    if (!parsed.success) return reply(ack, { ok: false, error: 'invalid_device' });
    if (expired()) {
      reply(ack, { ok: false, error: 'token_expired' });
      socket.disconnect(true);
      return undefined;
    }
    const organizationId = socket.data.organizationId;
    const allowed = organizationId ? await deps.deviceInOrganization(parsed.data, organizationId).catch(() => false) : false;
    if (!allowed) return reply(ack, { ok: false, error: 'device_not_found' });
    await socket.join(deviceRoom(parsed.data));
    return reply(ack, { ok: true });
  });

  socket.on('leave-device', async (payload: unknown, ack?: unknown) => {
    const parsed = devicePayload.safeParse(payload);
    if (!parsed.success) return reply(ack, { ok: false, error: 'invalid_device' });
    await socket.leave(deviceRoom(parsed.data));
    return reply(ack, { ok: true });
  });
}

export function attachRecognitionSocket(io: Server, deps: SocketDeps): void {
  io.use((socket, next) => socketAuth(deps)(socket, next));
  io.on('connection', (socket) => registerDeviceRooms(socket, deps));
}

export function publishDetection(io: { to(room: string): { emit(event: string, payload: unknown): unknown } }, message: DetectionMessage): void {
  io.to(deviceRoom(message.deviceId)).emit('detection', message);
}
