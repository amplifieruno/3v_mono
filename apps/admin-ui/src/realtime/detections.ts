import { z } from 'zod';
import type { TokenStore } from '../auth/token-store';

/**
 * Live detections of one camera over the backend's Socket.io (`apps/backend/src/recognition/socket.ts`):
 * connect with the organization token, `join-device` the camera's room, receive `detection`
 * events. The server disconnects a socket whose token expired; the stream then reconnects with a
 * fresh token from `getToken()`. When the token store moves to another organization (or signs
 * out) the socket of the previous organization is closed at once, so no detection of it arrives
 * after the switch, and the stream reopens with the new organization's token.
 */

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

/** Why the stream stopped for good: retrying cannot change these. */
export type DetectionStreamError = 'signed-out' | 'unauthorized' | 'device-not-found' | 'invalid-device';

export type DetectionStreamState =
  | { readonly status: 'connecting' }
  | { readonly status: 'live' }
  | { readonly status: 'reconnecting' }
  | { readonly status: 'failed'; readonly error: DetectionStreamError };

/** One connection, as the stream uses it (`./socket-io.ts` adapts socket.io-client). */
export interface DetectionSocket {
  onConnect(handler: () => void): void;
  onConnectError(handler: (message: string) => void): void;
  onDisconnect(handler: (reason: string) => void): void;
  onDetection(handler: (payload: unknown) => void): void;
  join(deviceId: string, ack: (result: unknown) => void): void;
  close(): void;
}

/** Opens one connection authenticated with `token`. */
export type DetectionSocketFactory = (token: string) => DetectionSocket;

export interface DetectionStreamOptions {
  readonly deviceId: string;
  /** The organization token, renewed when it is about to expire; `null` without an organization. */
  readonly getToken: () => Promise<string | null>;
  readonly onDetection: (message: DetectionMessage) => void;
  readonly onState: (state: DetectionStreamState) => void;
  readonly connect: DetectionSocketFactory;
  /** Organization switches and sign-outs close the socket. */
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
  /** Delays before successive reconnects; the last one repeats. */
  readonly retryDelaysMs?: readonly number[];
}

export interface DetectionStream {
  close(): void;
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000] as const;

/** Refused connections in a row (with fresh tokens) before the stream gives up. */
const MAX_UNAUTHORIZED = 3;

const ackResult = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const JOIN_ERRORS: Readonly<Record<string, DetectionStreamError>> = {
  device_not_found: 'device-not-found',
  invalid_device: 'invalid-device',
};

export function openDetectionStream(options: DetectionStreamOptions): DetectionStream {
  const { deviceId, getToken, onDetection, onState, connect, store } = options;
  const delays = options.retryDelaysMs?.length ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  let closed = false;
  /** Bumped whenever a connection is dropped: handlers of older connections are ignored. */
  let generation = 0;
  let socket: DetectionSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let unauthorized = 0;
  let organization = store?.snapshot().org?.organizationId ?? null;

  const drop = (): void => {
    generation += 1;
    clearTimeout(timer);
    timer = undefined;
    const current = socket;
    socket = null;
    current?.close();
  };

  const fail = (error: DetectionStreamError): void => {
    drop();
    onState({ status: 'failed', error });
  };

  const retry = (): void => {
    drop();
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
    attempt += 1;
    onState({ status: 'reconnecting' });
    timer = setTimeout(() => void open(), delay);
  };

  async function open(): Promise<void> {
    const gen = ++generation;
    const token = await getToken().catch(() => undefined);
    const current = (): boolean => !closed && gen === generation;
    if (!current()) return;
    if (token === undefined) return retry();
    if (token === null) return fail('signed-out');
    const connection = connect(token);
    socket = connection;
    connection.onConnect(() => {
      if (!current()) return;
      connection.join(deviceId, (result) => {
        if (!current()) return;
        const parsed = ackResult.safeParse(result);
        if (parsed.success && parsed.data.ok) {
          attempt = 0;
          unauthorized = 0;
          onState({ status: 'live' });
          return;
        }
        const error = parsed.success && !parsed.data.ok ? JOIN_ERRORS[parsed.data.error] : undefined;
        if (error) fail(error);
        else retry(); // token_expired, or an answer this client does not know
      });
    });
    connection.onConnectError((message) => {
      if (!current()) return;
      if (message === 'unauthorized') {
        unauthorized += 1;
        if (unauthorized >= MAX_UNAUTHORIZED) return fail('unauthorized');
      }
      retry();
    });
    connection.onDisconnect(() => {
      if (current()) retry();
    });
    connection.onDetection((payload) => {
      if (!current()) return;
      const parsed = detectionMessage.safeParse(payload);
      if (parsed.success && parsed.data.deviceId === deviceId) onDetection(parsed.data);
    });
  }

  const unsubscribe = store?.subscribe(() => {
    const next = store.snapshot().org?.organizationId ?? null;
    if (closed || next === organization) return;
    organization = next;
    if (next === null) return fail('signed-out');
    // Another organization: its socket replaces the previous one's at once.
    drop();
    attempt = 0;
    unauthorized = 0;
    onState({ status: 'connecting' });
    void open();
  });

  onState({ status: 'connecting' });
  void open();

  return {
    close() {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      drop();
    },
  };
}
