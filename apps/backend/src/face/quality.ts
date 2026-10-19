import type { ExtractedFace } from './insightFaceClient.js';

/** Faces scoring below this are rejected for enrollment (`low_quality`). */
export const MIN_QUALITY = 0.3;

/** Recognizer input side (ArcFace 112x112): larger faces add no detail. */
const FULL_DETAIL_PX = 112;
/** Detector threshold used by the client: a score at this level contributes nothing. */
const DETECTION_FLOOR = 0.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Face quality 0..1 for template ranking and enrollment filtering:
 * the mean of the detection confidence (rescaled above 0.5) and the face size (shorter bbox side vs 112 px),
 * multiplied by the share of the box inside the image (faces cut by the border lose quality).
 */
export function qualityScore(face: ExtractedFace, imageWidth: number, imageHeight: number): number {
  const [x1, y1, x2, y2] = face.bbox;
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  if (width === 0 || height === 0) return 0;

  const detection = clamp01((face.score - DETECTION_FLOOR) / (1 - DETECTION_FLOOR));
  const size = clamp01(Math.min(width, height) / FULL_DETAIL_PX);

  const insideWidth = Math.max(0, Math.min(x2, imageWidth) - Math.max(x1, 0));
  const insideHeight = Math.max(0, Math.min(y2, imageHeight) - Math.max(y1, 0));
  const inside = (insideWidth * insideHeight) / (width * height);

  return clamp01(((detection + size) / 2) * inside);
}
