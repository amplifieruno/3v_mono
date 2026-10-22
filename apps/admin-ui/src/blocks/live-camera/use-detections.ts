import * as React from 'react';
import type { DetectionMessage, DetectionStreamState } from '../../realtime/detection-types';
import { type DetectionHubSource, sharedDetectionHub } from '../../realtime/shared-hub';

/** How long a detection's box stays on the video (it fades out over the last half second). */
export const BOX_LIFETIME_MS = 2_000;

/**
 * What the live view needs to receive detections: the session's detection hub is built from it
 * once, so every view given the same deps shares one connection.
 */
export type DetectionDeps = DetectionHubSource;

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
  /** Starts the session's connection over (offered after repeated refusals). */
  readonly reconnect: () => void;
}

/**
 * The live detections of one camera while the view is mounted, over the session's shared
 * connection (`sharedDetectionHub`): the camera's room is joined while the view is mounted.
 */
export function useDetections(deviceId: string, deps: DetectionDeps): LiveDetections {
  const [state, setState] = React.useState<LiveDetectionsState>({ status: 'connecting' });
  const [boxes, setBoxes] = React.useState<readonly DetectionMessage[]>([]);
  const [counters, setCounters] = React.useState<DetectionCounters>(NO_COUNTERS);
  const hubRef = React.useRef<{ reconnect(): void } | null>(null);

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

    sharedDetectionHub(deps).then(
      (hub) => {
        if (cancelled) return;
        hubRef.current = hub;
        const subscription = hub.subscribe(deviceId, {
          onDetection,
          onState: (next) => {
            setState(next);
            // Boxes drawn under a stream that is no longer live (an organization switch, a
            // failure, a reconnect) are not current any more.
            if (next.status !== 'live') setBoxes([]);
          },
        });
        close = () => subscription.close();
      },
      () => {
        if (!cancelled) setState({ status: 'unavailable' });
      },
    );

    return () => {
      cancelled = true;
      hubRef.current = null;
      close?.();
      for (const timer of timers) clearTimeout(timer);
    };
  }, [deviceId, deps]);

  const reconnect = React.useCallback(() => hubRef.current?.reconnect(), []);
  return { state, boxes, counters, reconnect };
}
