import type { DetectionSocketFactory } from './detection-types';

/** Where the backend's Socket.io answers: same origin, proxied by vite in dev and nginx in prod. */
export const SOCKET_IO_PATH = '/socket.io';

/**
 * The socket.io-client connection behind the detection stream, loaded on demand so the client
 * library stays out of the initial bundle. One connection per detection hub (`forceNew`: the
 * session's hub owns it; a server disconnect on token expiry drops only it) and no built-in
 * reconnection: the hub reconnects itself with a fresh token and joins its rooms again.
 */
export async function loadSocketIoFactory(): Promise<DetectionSocketFactory> {
  const { io } = await import('socket.io-client');
  return (token) => {
    const socket = io({ path: SOCKET_IO_PATH, auth: { token }, forceNew: true, reconnection: false });
    return {
      onConnect: (handler) => void socket.on('connect', handler),
      onConnectError: (handler) => void socket.on('connect_error', (error) => handler(error.message)),
      onDisconnect: (handler) => void socket.on('disconnect', (reason) => handler(reason)),
      onDetection: (handler) => void socket.on('detection', (payload: unknown) => handler(payload)),
      join: (deviceId, ack) => void socket.emit('join-device', { deviceId }, (result: unknown) => ack(result)),
      leave: (deviceId) => void socket.emit('leave-device', { deviceId }),
      close: () => void socket.disconnect(),
    };
  };
}
