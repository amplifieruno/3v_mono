import * as React from 'react';
import type { TokenStore } from '../../auth/token-store';
import {
  type DetectionMessage,
  type DetectionSocketFactory,
  type DetectionStreamState,
  openDetectionStream,
} from '../../realtime/detections';

/** How long a detection's box stays on the video (it fades out over the last half second). */
export const BOX_LIFETIME_MS = 2_000;

/** What the live view needs to receive detections. */
export interface DetectionDeps {
  /** The Socket.io connection factory, loaded on demand. */
  readonly loadSocket: () => Promise<DetectionSocketFactory>;
  readonly getToken: () => Promise<string | null>;
  readonly store?: Pick<TokenStore, 'snapshot' | 'subscribe'>;
}

/** The stream's state, or `unavailable` when the socket client itself could not be loaded. */
export type LiveDetectionsState = DetectionStreamState | { readonly status: 'unavailable' };

/** Detections received since the view opened. */
export interface DetectionCounters {
  readonly detections: number;
  /** Faces matched to a person with a profile. */
  readonly known: number;
  /** Faces that created a new identity. */
  readonly newIdentities: number;
  /** Faces neither matched nor good enough to create an identity. */
  readonly unidentified: number;
}

const NO_COUNTERS: DetectionCounters = { detections: 0, known: 0, newIdentities: 0, unidentified: 0 };

function counted(counters: DetectionCounters, message: DetectionMessage): DetectionCounters {
  return {
    detections: counters.detections + 1,
    known: counters.known + (message.profileId ? 1 : 0),
    newIdentities: counters.newIdentities + (message.isNewIdentity ? 1 : 0),
    unidentified: counters.unidentified + (message.identityId === null ? 1 : 0),
  };
}

/** One person's box: a newer detection of the same identity replaces the older one. */
const boxKey = (message: DetectionMessage): string => message.identityId ?? message.detectionId;

const frameTime = (message: DetectionMessage): number => Date.parse(message.detectedAt);

/**
 * The boxes once `message` arrived. The faces of one analysed frame share its time: a newer
 * frame replaces the boxes of older ones (the same face is not boxed twice when it moved, nor
 * when it was not identified), and a late detection of an older frame is not drawn.
 */
function shown(current: readonly DetectionMessage[], message: DetectionMessage): readonly DetectionMessage[] {
  const at = frameTime(message);
  if (current.some((box) => frameTime(box) > at)) return current;
  const key = boxKey(message);
  return [...current.filter((box) => frameTime(box) === at && boxKey(box) !== key), message];
}

export interface LiveDetections {
  readonly state: LiveDetectionsState;
  /** The detections of the latest frame, for {@link BOX_LIFETIME_MS} at most, one per identity. */
  readonly boxes: readonly DetectionMessage[];
  readonly counters: DetectionCounters;
}

/** The live detections of one camera while the view is mounted. */
export function useDetections(deviceId: string, deps: DetectionDeps): LiveDetections {
  const [state, setState] = React.useState<LiveDetectionsState>({ status: 'connecting' });
  const [boxes, setBoxes] = React.useState<readonly DetectionMessage[]>([]);
  const [counters, setCounters] = React.useState<DetectionCounters>(NO_COUNTERS);

  React.useEffect(() => {
    let cancelled = false;
    let close: (() => void) | undefined;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    setState({ status: 'connecting' });
    setBoxes([]);
    setCounters(NO_COUNTERS);

    const onDetection = (message: DetectionMessage): void => {
      setBoxes((current) => shown(current, message));
      setCounters((current) => counted(current, message));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setBoxes((current) => current.filter((box) => box.detectionId !== message.detectionId));
      }, BOX_LIFETIME_MS);
      timers.add(timer);
    };

    deps.loadSocket().then(
      (connect) => {
        if (cancelled) return;
        const stream = openDetectionStream({
          deviceId,
          getToken: deps.getToken,
          store: deps.store,
          connect,
          onDetection,
          onState: (next) => {
            setState(next);
            // Boxes drawn under a stream that is no longer live (an organization switch, a
            // failure, a reconnect) are not current any more.
            if (next.status !== 'live') setBoxes([]);
          },
        });
        close = () => stream.close();
      },
      () => {
        if (!cancelled) setState({ status: 'unavailable' });
      },
    );

    return () => {
      cancelled = true;
      close?.();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [deviceId, deps]);

  return { state, boxes, counters };
}
