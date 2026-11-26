import type { DetectionMessage } from '../../realtime/detection-types';

/** A face drawn at one moment of the video: its latest detection, placed where the face is now. */
export interface SyncedBox extends DetectionMessage {
  /** One person's box keeps its key while they move (the identity, or the detection when unidentified). */
  readonly key: string;
  readonly opacity: number;
}

/** A face stays at its last position this long after the frame it was last found on. */
export const BOX_HOLD_MS = 1_000;

/** Then it fades out over this long. */
const BOX_FADE_MS = 300;

/** Two sightings further apart than this are not joined by a movement (the face left in between). */
const MAX_GAP_MS = 2_000;

/** How long detections are kept for drawing, behind the newest one. */
export const HISTORY_MS = 10_000;

const timeOf = (message: DetectionMessage): number => Date.parse(message.detectedAt);
const keyOf = (message: DetectionMessage): string => message.identityId ?? message.detectionId;
const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;

/**
 * The boxes to draw over the frame shown at `at` (wall-clock ms): for each person, the detection
 * of the latest analysed frame at or before `at`, moved towards their next detection when the
 * next frame is already known, held for {@link BOX_HOLD_MS} after the last one and faded out.
 * A detection whose frame the video has not reached yet is not drawn, and a face the latest
 * analysed frame on screen did not find again is dropped (one face never carries two boxes).
 */
export function boxesAt(history: readonly DetectionMessage[], at: number): SyncedBox[] {
  // The latest analysed frame on screen: a face it did not find again is gone (or was taken for someone else).
  let latest = -Infinity;
  for (const message of history) {
    const t = timeOf(message);
    if (t <= at && t > latest) latest = t;
  }
  const byKey = new Map<string, DetectionMessage[]>();
  for (const message of history) {
    const key = keyOf(message);
    const list = byKey.get(key);
    if (list) list.push(message);
    else byKey.set(key, [message]);
  }
  const boxes: SyncedBox[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) => timeOf(a) - timeOf(b));
    const prevIndex = sorted.findLastIndex((message) => timeOf(message) <= at);
    const prev = sorted[prevIndex];
    if (!prev || timeOf(prev) < latest) continue;
    const since = at - timeOf(prev);
    if (since > BOX_HOLD_MS + BOX_FADE_MS) continue;
    const next = sorted[prevIndex + 1];
    let bbox = prev.bbox;
    if (next && timeOf(next) - timeOf(prev) <= MAX_GAP_MS && next.frameWidth === prev.frameWidth) {
      const f = since / (timeOf(next) - timeOf(prev));
      bbox = {
        x: lerp(prev.bbox.x, next.bbox.x, f),
        y: lerp(prev.bbox.y, next.bbox.y, f),
        width: lerp(prev.bbox.width, next.bbox.width, f),
        height: lerp(prev.bbox.height, next.bbox.height, f),
      };
    }
    const opacity = next || since <= BOX_HOLD_MS ? 1 : Math.max(0, 1 - (since - BOX_HOLD_MS) / BOX_FADE_MS);
    if (opacity <= 0) continue;
    boxes.push({ ...prev, bbox, key, opacity });
  }
  return boxes;
}
