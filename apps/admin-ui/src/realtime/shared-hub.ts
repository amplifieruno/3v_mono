import type { TokenStore } from '../auth/token-store';
import { type DetectionHub, createDetectionHub } from './detection-hub';
import type { DetectionSocketFactory } from './detection-types';

/** What a session's detection hub is built from. */
export interface DetectionHubSource {
  /** The Socket.io connection factory, loaded on demand. */
  readonly loadSocket: () => Promise<DetectionSocketFactory>;
  readonly getToken: () => Promise<string | null>;
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
}

const hubs = new WeakMap<DetectionHubSource, Promise<DetectionHub>>();

/**
 * The one detection hub of `source` (one per signed-in session: the console builds a single
 * source per auth provider), created when a view first asks for it. A socket client that could
 * not be loaded is asked for again by the next view.
 */
export function sharedDetectionHub(source: DetectionHubSource): Promise<DetectionHub> {
  const known = hubs.get(source);
  if (known !== undefined) return known;
  const hub = source.loadSocket().then((connect) =>
    createDetectionHub({ getToken: source.getToken, store: source.store, connect }),
  );
  hubs.set(source, hub);
  hub.catch(() => {
    if (hubs.get(source) === hub) hubs.delete(source);
  });
  return hub;
}
