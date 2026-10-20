import sharp from 'sharp';
import type { ExtractedFace } from '../face/insightFaceClient.js';
import { MIN_QUALITY, qualityScore } from '../face/quality.js';

/**
 * Per-frame capture quality of an authentication sequence (failure reasons of SA_6 §2.1.1). Thresholds (documented in
 * the conventions; calibrated on the seed faces and the test fixtures with the compose InsightFace models):
 * - no_face: the detector (score >= 0.6) finds nothing;
 * - multiple_faces: another face at least half the size (shorter box side) of the main (largest) face;
 * - low_quality: face quality (src/face/quality: detector confidence, size vs 112 px, inside the image) < 0.3;
 * - poor_lighting: mean grey level of the face box (64x64) < 30 (dark) or > 225 (overexposed), 0..255;
 * - blur: variance of the 4-neighbour Laplacian over that 64x64 face box < 40 (sharp captures measure 120..1300,
 *   a 2 px Gaussian blur ~30).
 */
export type QualityReason = 'no_face' | 'multiple_faces' | 'low_quality' | 'poor_lighting' | 'blur';

export const SECOND_FACE_RATIO = 0.5;
export const DARK_MEAN = 30;
export const BRIGHT_MEAN = 225;
export const MIN_SHARPNESS = 40;
const CROP = 64;

export type FrameAnalysis = {
  index: number;
  faces: number;
  reason?: QualityReason;
  /** The main face (largest box); absent when no face. */
  face?: ExtractedFace;
  bbox?: [number, number, number, number];
  quality?: number;
  brightness?: number;
  sharpness?: number;
  /** 64-bit difference hash (hex) of the face box: the inter-frame change measure of the liveness heuristic. */
  hash?: string;
};

const side = (f: ExtractedFace) => Math.min(f.bbox[2] - f.bbox[0], f.bbox[3] - f.bbox[1]);

function clampBox(bbox: [number, number, number, number], width: number, height: number) {
  const left = Math.max(0, Math.floor(bbox[0]));
  const top = Math.max(0, Math.floor(bbox[1]));
  const right = Math.min(width, Math.ceil(bbox[2]));
  const bottom = Math.min(height, Math.ceil(bbox[3]));
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

/** Mean grey level and Laplacian variance of the face box (64x64), and its 9x8 difference hash. */
async function faceStats(image: Buffer, box: ReturnType<typeof clampBox>) {
  const grey = sharp(image).extract(box).greyscale();
  const raw = await grey.clone().resize(CROP, CROP, { fit: 'fill' }).raw().toBuffer();
  let sum = 0;
  for (const v of raw) sum += v;
  let lap = 0;
  let lap2 = 0;
  let n = 0;
  for (let y = 1; y < CROP - 1; y += 1) {
    for (let x = 1; x < CROP - 1; x += 1) {
      const i = y * CROP + x;
      const v = raw[i - CROP] + raw[i + CROP] + raw[i - 1] + raw[i + 1] - 4 * raw[i];
      lap += v;
      lap2 += v * v;
      n += 1;
    }
  }
  const small = await grey.clone().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) bits += small[y * 9 + x] > small[y * 9 + x + 1] ? '1' : '0';
  const hash = BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  return { brightness: sum / raw.length, sharpness: lap2 / n - (lap / n) ** 2, hash };
}

/** Quality of one frame (`image` orientation-normalized, as sent to InsightFace) from its detected faces. */
export async function analyzeFrame(
  index: number,
  image: Buffer,
  width: number,
  height: number,
  faces: ExtractedFace[],
): Promise<FrameAnalysis> {
  if (faces.length === 0) return { index, faces: 0, reason: 'no_face' };
  const sorted = [...faces].sort((a, b) => side(b) - side(a));
  const face = sorted[0];
  const result: FrameAnalysis = { index, faces: faces.length, face, bbox: face.bbox };
  if (sorted.slice(1).some((other) => side(other) >= SECOND_FACE_RATIO * side(face))) {
    return { ...result, reason: 'multiple_faces' };
  }
  result.quality = Number(qualityScore(face, width, height).toFixed(3));
  const stats = await faceStats(image, clampBox(face.bbox, width, height));
  result.brightness = Math.round(stats.brightness);
  result.sharpness = Math.round(stats.sharpness);
  result.hash = stats.hash;
  if (result.quality < MIN_QUALITY) return { ...result, reason: 'low_quality' };
  if (stats.brightness < DARK_MEAN || stats.brightness > BRIGHT_MEAN) return { ...result, reason: 'poor_lighting' };
  if (stats.sharpness < MIN_SHARPNESS) return { ...result, reason: 'blur' };
  return result;
}

/** The sequence's failure reason: the first failing frame decides (every frame must be usable). */
export function sequenceReason(frames: FrameAnalysis[]): QualityReason | undefined {
  return frames.find((f) => f.reason)?.reason;
}

/** l2-normalized mean of the main-face embeddings (the probe). */
export function meanEmbedding(frames: FrameAnalysis[]): number[] {
  const vectors = frames.map((f) => f.face?.embedding).filter((v): v is number[] => Array.isArray(v));
  if (vectors.length === 0) throw new Error('No embeddings to average');
  const mean = vectors[0].map((_, i) => vectors.reduce((sum, v) => sum + v[i], 0) / vectors.length);
  const norm = Math.hypot(...mean) || 1;
  return mean.map((v) => v / norm);
}

/** Best frame (highest quality) for the evidence crop. */
export function bestFrame(frames: FrameAnalysis[]): FrameAnalysis | undefined {
  return [...frames].filter((f) => f.bbox).sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))[0];
}
