import { z } from 'zod';
import type { TokenStore } from '../auth/token-store';
import {
  type DetectionMessage,
  type DetectionSocketFactory,
  type DetectionStreamError,
  type DetectionStreamState,
  detectionMessage,
} from './detection-types';

/**
 * Live detections of many cameras over ONE Socket.io connection (`apps/backend/src/recognition/socket.ts`
 * accepts several `join-device` on a socket): every view that shows a camera live subscribes to
 * its device here, the hub joins the device's room once and leaves it when the last view of the
 * device goes. The connection opens with the first subscriber and closes with the last one.
 *
 * The server disconnects a socket whose token expired; the hub then reconnects with a fresh
 * token from `getToken()` and joins every subscribed room again. When the token store moves to
 * another organization (or signs out) the socket of the previous organization is closed at
 * once, so no detection of it arrives after the switch. Repeated `unauthorized` refusals stop
 * the hub for every subscriber until `reconnect()`; a room the server refuses (`device_not_found`,
 * `invalid_device`) stops that device's subscribers only.
 */

export interface DetectionSubscriber {
  readonly onDetection: (message: DetectionMessage) => void;
  readonly onState: (state: DetectionStreamState) => void;
}

export interface DetectionSubscription {
  close(): void;
}

export interface DetectionHub {
  /** Live detections of `deviceId`; the subscriber hears its current state at once. */
  subscribe(deviceId: string, subscriber: DetectionSubscriber): DetectionSubscription;
  /** A fresh connection for every subscriber, after a failure (repeated refusals, a refused room). */
  reconnect(): void;
  /** Ends every subscription without telling the subscribers. */
  close(): void;
}

export interface DetectionHubOptions {
  /** The organization token, renewed when it is about to expire; `null` without an organization. */
  readonly getToken: () => Promise<string | null>;
  readonly connect: DetectionSocketFactory;
  /** Organization switches and sign-outs close the socket. */
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
  /** Delays before successive reconnects; the last one repeats. */
  readonly retryDelaysMs?: readonly number[];
}

const DEFAULT_RETRY_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000] as const;

/** Refused connections in a row (with fresh tokens) before the hub gives up. */
export const MAX_UNAUTHORIZED = 3;

const ackResult = z.union([
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.string() }),
]);

const JOIN_ERRORS: Readonly<Record<string, DetectionStreamError>> = {
  device_not_found: 'device-not-found',
  invalid_device: 'invalid-device',
};

type Room = 'joining' | 'joined';
type Phase = 'connecting' | 'reconnecting' | 'connected';

export function createDetectionHub(options: DetectionHubOptions): DetectionHub {
  const { getToken, connect, store } = options;
  const delays = options.retryDelaysMs?.length ? options.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
  const subscribers = new Map<number, { readonly deviceId: string; readonly subscriber: DetectionSubscriber }>();
  let nextId = 0;
  /** Bumped whenever a connection is dropped: handlers of older connections are ignored. */
  let generation = 0;
  let socket: ReturnType<DetectionSocketFactory> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let phase: Phase | null = null;
  let attempt = 0;
  let unauthorized = 0;
  /** The whole hub stopped (until `reconnect()` or an organization switch). */
  let failure: DetectionStreamError | null = null;
  /** Rooms of the current connection. */
  const rooms = new Map<string, Room>();
  /** Devices the server refused; sticky across reconnects of the same organization. */
  const refused = new Map<string, DetectionStreamError>();
  let organization = store?.snapshot().org?.organizationId ?? null;
  let unsubscribeStore: (() => void) | undefined;

  const devices = (): Set<string> => new Set([...subscribers.values()].map((entry) => entry.deviceId));
  const activeDevices = (): string[] => [...devices()].filter((deviceId) => !refused.has(deviceId));

  /** Tells the subscribers of `deviceId` (every device when omitted) a state. */
  const tell = (state: DetectionStreamState, deviceId?: string): void => {
    for (const entry of [...subscribers.values()]) {
      if (deviceId !== undefined && entry.deviceId !== deviceId) continue;
      if (deviceId === undefined && refused.has(entry.deviceId)) continue;
      entry.subscriber.onState(state);
    }
  };

  const drop = (): void => {
    generation += 1;
    clearTimeout(timer);
    timer = undefined;
    phase = null;
    rooms.clear();
    const current = socket;
    socket = null;
    current?.close();
  };

  const failAll = (error: DetectionStreamError): void => {
    drop();
    failure = error;
    tell({ status: 'failed', error });
  };

  const retry = (): void => {
    drop();
    const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0;
    attempt += 1;
    phase = 'reconnecting';
    tell({ status: 'reconnecting' });
    timer = setTimeout(() => void open(), delay);
  };

  /** Drops the connection when no subscribed device can use it any more. */
  const dropWhenUnused = (): void => {
    if (activeDevices().length === 0) drop();
  };

  function join(connection: ReturnType<DetectionSocketFactory>, gen: number, deviceId: string): void {
    rooms.set(deviceId, 'joining');
    connection.join(deviceId, (result) => {
      if (gen !== generation || rooms.get(deviceId) !== 'joining') return;
      const parsed = ackResult.safeParse(result);
      if (parsed.success && parsed.data.ok) {
        attempt = 0;
        unauthorized = 0;
        rooms.set(deviceId, 'joined');
        tell({ status: 'live' }, deviceId);
        return;
      }
      const error = parsed.success && !parsed.data.ok ? JOIN_ERRORS[parsed.data.error] : undefined;
      if (error === undefined) return retry(); // token_expired, or an answer this client does not know
      rooms.delete(deviceId);
      refused.set(deviceId, error);
      tell({ status: 'failed', error }, deviceId);
      dropWhenUnused();
    });
  }

  async function open(): Promise<void> {
    const gen = ++generation;
    phase ??= 'connecting';
    const token = await getToken().catch(() => undefined);
    if (gen !== generation) return;
    if (token === undefined) return retry();
    if (token === null) return failAll('signed-out');
    const connection = connect(token);
    socket = connection;
    connection.onConnect(() => {
      if (gen !== generation) return;
      phase = 'connected';
      for (const deviceId of activeDevices()) join(connection, gen, deviceId);
    });
    connection.onConnectError((message) => {
      if (gen !== generation) return;
      if (message === 'unauthorized') {
        unauthorized += 1;
        if (unauthorized >= MAX_UNAUTHORIZED) return failAll('unauthorized');
      }
      retry();
    });
    connection.onDisconnect(() => {
      if (gen === generation) retry();
    });
    connection.onDetection((payload) => {
      if (gen !== generation) return;
      const parsed = detectionMessage.safeParse(payload);
      if (!parsed.success || rooms.get(parsed.data.deviceId) !== 'joined') return;
      for (const entry of [...subscribers.values()]) {
        if (entry.deviceId === parsed.data.deviceId) entry.subscriber.onDetection(parsed.data);
      }
    });
  }

  /** Opens a fresh connection for every subscriber that is not refused. */
  const restart = (): void => {
    drop();
    attempt = 0;
    unauthorized = 0;
    failure = null;
    if (activeDevices().length === 0) return;
    phase = 'connecting';
    tell({ status: 'connecting' });
    void open();
  };

  const onStoreChange = (): void => {
    const next = store?.snapshot().org?.organizationId ?? null;
    if (next === organization) return;
    organization = next;
    if (next === null) return failAll('signed-out');
    // Another organization: its socket replaces the previous one's at once, and the rooms the
    // previous organization refused may exist in this one.
    for (const deviceId of refused.keys()) tell({ status: 'connecting' }, deviceId);
    refused.clear();
    restart();
  };

  const watchStore = (): void => {
    if (store === undefined || unsubscribeStore !== undefined) return;
    organization = store.snapshot().org?.organizationId ?? null;
    unsubscribeStore = store.subscribe(onStoreChange);
  };

  const stopAll = (): void => {
    drop();
    unsubscribeStore?.();
    unsubscribeStore = undefined;
    failure = null;
    attempt = 0;
    unauthorized = 0;
    refused.clear();
  };

  return {
    subscribe(deviceId, subscriber) {
      const id = nextId++;
      const known = devices().has(deviceId);
      subscribers.set(id, { deviceId, subscriber });
      watchStore();
      const refusal = refused.get(deviceId);
      if (failure !== null) subscriber.onState({ status: 'failed', error: failure });
      else if (refusal !== undefined) subscriber.onState({ status: 'failed', error: refusal });
      else if (phase === null) {
        phase = 'connecting';
        subscriber.onState({ status: 'connecting' });
        void open();
      } else if (phase !== 'connected') subscriber.onState({ status: phase });
      else if (!known && socket !== null) {
        subscriber.onState({ status: 'connecting' });
        join(socket, generation, deviceId);
      } else subscriber.onState({ status: rooms.get(deviceId) === 'joined' ? 'live' : 'connecting' });

      let closed = false;
      return {
        close() {
          if (closed) return;
          closed = true;
          subscribers.delete(id);
          if (subscribers.size === 0) return stopAll();
          if (devices().has(deviceId)) return;
          refused.delete(deviceId);
          const room = rooms.get(deviceId);
          rooms.delete(deviceId);
          if (room === 'joined' && socket !== null) socket.leave(deviceId);
          dropWhenUnused();
        },
      };
    },
    reconnect() {
      if (subscribers.size === 0) return;
      for (const deviceId of refused.keys()) tell({ status: 'connecting' }, deviceId);
      refused.clear();
      restart();
    },
    close() {
      subscribers.clear();
      stopAll();
    },
  };
}
