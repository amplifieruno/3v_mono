import { z } from 'zod';

/** `DetectionMessage` of `apps/backend/src/recognition/types.ts`, validated on arrival. */
export const detectionMessage = z.object({
  detectionId: z.string(),
  deviceId: z.string(),
  identityId: z.string().nullable(),
  identityCode: z.string().nullable(),
  profileId: z.string().nullable(),
  profileName: z.string().nullable(),
  isNewIdentity: z.boolean(),
  confidence: z.number(),
  bbox: z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() }),
  frameWidth: z.number().positive(),
  frameHeight: z.number().positive(),
  detectedAt: z.string(),
});

export type DetectionMessage = z.infer<typeof detectionMessage>;

/** Why the stream stopped: retrying alone cannot change these (`reconnect()` starts over). */
export type DetectionStreamError = 'signed-out' | 'unauthorized' | 'device-not-found' | 'invalid-device';

export type DetectionStreamState =
  | { readonly status: 'connecting' }
  | { readonly status: 'live' }
  | { readonly status: 'reconnecting' }
  | { readonly status: 'failed'; readonly error: DetectionStreamError };

/** One connection, as the hub uses it (`./socket-io.ts` adapts socket.io-client). */
export interface DetectionSocket {
  onConnect(handler: () => void): void;
  onConnectError(handler: (message: string) => void): void;
  onDisconnect(handler: (reason: string) => void): void;
  onDetection(handler: (payload: unknown) => void): void;
  join(deviceId: string, ack: (result: unknown) => void): void;
  leave(deviceId: string): void;
  close(): void;
}

/** Opens one connection authenticated with `token`. */
export type DetectionSocketFactory = (token: string) => DetectionSocket;
