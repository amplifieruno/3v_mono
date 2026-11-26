import * as React from 'react';
import { type SyncedBox, boxesAt } from './synced-boxes';
import type { LiveDetections } from './use-detections';

/** How often the boxes are placed again while the video plays (about 30 times a second). */
const REDRAW_MS = 33;

/**
 * The boxes to draw over the playing video. When the stream tells the wall-clock time of the
 * frame on screen (`clock`), each face is drawn on the frame it was found on and moves with it
 * ({@link boxesAt}); otherwise each detection is drawn when it arrives, for two seconds.
 * `synced` tells which of the two the boxes follow.
 */
export function useSyncedBoxes(
  live: Pick<LiveDetections, 'boxes' | 'history'>,
  clock: () => number | null,
): { readonly boxes: readonly SyncedBox[]; readonly synced: boolean } {
  const [at, setAt] = React.useState<number | null>(null);
  const active = live.history.length > 0;
  React.useEffect(() => {
    if (!active) return undefined;
    let frame = 0;
    let last = 0;
    const step = (now: number): void => {
      if (now - last >= REDRAW_MS) {
        last = now;
        setAt(clock());
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, clock]);
  return React.useMemo(() => {
    if (at === null || !active) {
      return {
        boxes: live.boxes.map((box) => ({ ...box, key: box.detectionId, opacity: 1 })),
        synced: false,
      };
    }
    return { boxes: boxesAt(live.history, at), synced: true };
  }, [at, active, live.boxes, live.history]);
}
