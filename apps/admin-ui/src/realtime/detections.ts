import type { TokenStore } from '../auth/token-store';
import { createDetectionHub } from './detection-hub';
import type { DetectionMessage, DetectionSocketFactory, DetectionStreamState } from './detection-types';

export {
  type DetectionMessage,
  type DetectionSocket,
  type DetectionSocketFactory,
  type DetectionStreamError,
  type DetectionStreamState,
  detectionMessage,
} from './detection-types';

/**
 * Live detections of one camera on a connection of its own: a hub (`./detection-hub.ts`) with
 * a single subscriber. Views share one connection through the hub instead; this stays for a
 * caller that wants a private one.
 */
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
  /** Starts over after a failure (repeated refusals, a refused camera). */
  reconnect(): void;
  close(): void;
}

export function openDetectionStream(options: DetectionStreamOptions): DetectionStream {
  const { deviceId, onDetection, onState, ...hubOptions } = options;
  const hub = createDetectionHub(hubOptions);
  const subscription = hub.subscribe(deviceId, { onDetection, onState });
  return {
    reconnect: () => hub.reconnect(),
    close() {
      subscription.close();
      hub.close();
    },
  };
}
