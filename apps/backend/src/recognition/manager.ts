import type { RecognitionSession } from './session.js';
import type { RecognitionDevice, SessionStats } from './types.js';

export type ManagerDeps = {
  /** Cameras with recognition enabled across all organizations. */
  listDevices(): Promise<RecognitionDevice[]>;
  createSession(device: RecognitionDevice): RecognitionSession;
  pollMs?: number;
  log(message: string): void;
};

export type RecognitionManager = {
  /** Polls now and every pollMs. */
  start(): void;
  /** Stops polling and every session. */
  stop(): void;
  /** Polls now (serialized with other polls); recognition_start/stop await it for an immediate effect. */
  refresh(): Promise<void>;
  status(deviceId: string): SessionStats | undefined;
};

const sameConfig = (a: RecognitionDevice, b: RecognitionDevice): boolean =>
  a.organizationId === b.organizationId && a.streamId === b.streamId && a.fps === b.fps;

/**
 * Keeps exactly one session per camera with recognition enabled: starts sessions for new devices, stops those of
 * disabled or deleted devices, restarts a session whose fps/stream changed. Polls every 10 s by default.
 */
export function createRecognitionManager(deps: ManagerDeps): RecognitionManager {
  const sessions = new Map<string, { device: RecognitionDevice; session: RecognitionSession }>();
  let timer: NodeJS.Timeout | undefined;
  // Set by stop(): a poll still in flight must not start sessions afterwards.
  let stopped = false;
  let chain: Promise<void> = Promise.resolve();

  async function poll(): Promise<void> {
    let devices: RecognitionDevice[];
    try {
      devices = await deps.listDevices();
    } catch (error: unknown) {
      deps.log(`recognition manager: listing devices failed: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (stopped) return;
    const wanted = new Map(devices.map((d) => [d.id, d]));
    for (const [id, entry] of sessions) {
      const next = wanted.get(id);
      if (!next || !sameConfig(entry.device, next)) {
        entry.session.stop();
        sessions.delete(id);
      }
    }
    for (const device of devices) {
      if (sessions.has(device.id)) continue;
      const session = deps.createSession(device);
      session.start();
      sessions.set(device.id, { device, session });
    }
  }

  function refresh(): Promise<void> {
    // A throwing poll is logged and never wedges the chain: later polls still run.
    chain = chain.then(poll).catch((error: unknown) => {
      deps.log(`recognition manager: poll failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    return chain;
  }

  return {
    start() {
      if (timer) return;
      stopped = false;
      void refresh();
      timer = setInterval(() => void refresh(), deps.pollMs ?? 10_000);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
      stopped = true;
      for (const { session } of sessions.values()) session.stop();
      sessions.clear();
    },
    refresh,
    status(deviceId) {
      return sessions.get(deviceId)?.session.stats();
    },
  };
}
