import type { DetectionSocketFactory } from './detections';

/** Where the backend's Socket.io answers: same origin, proxied by vite in dev and nginx in prod. */
export const SOCKET_IO_PATH = '/socket.io';

/**
 * The socket.io-client connection behind the detection stream, loaded on demand so the client
 * library stays out of the initial bundle. One connection per stream (`forceNew`: a server
 * disconnect on token expiry drops only that stream) and no built-in reconnection: the stream
 * reconnects itself with a fresh token.
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
      close: () => void socket.disconnect(),
    };
  };
}
