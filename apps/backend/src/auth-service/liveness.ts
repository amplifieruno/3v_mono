import type { FrameAnalysis } from './analysis.js';
import { hasDuplicateFrames } from './frames.js';

/**
 * Passive, sequence-based presentation attack heuristic (SA_6 §2.1.2; cheap and real, not a trained PAD model):
 * - byte-identical frames inside one sequence → `injection` (a camera never yields the same encoded frame twice: the
 *   data did not come from a live capture path);
 * - no inter-frame change → `printed_photo`: EVERY pair of frames has face-box difference hashes within
 *   STATIC_MAX_HAMMING bits AND embeddings with cosine >= STATIC_MIN_SIMILARITY (a still picture held to the camera,
 *   or a re-encoded copy of one image: measured hamming 0..2, cosine 0.986..0.993; distinct live captures of the
 *   same person measured hamming 4..12, cosine 0.83..0.98). A still screen looks the same and is recorded under the
 *   same outcome; masks are not detected (never reported);
 * - otherwise `passed`.
 * Replayed sequences (digest seen before) and binding mismatches are `injection` too (SQL / pipeline).
 */
export const STATIC_MAX_HAMMING = 2;
export const STATIC_MIN_SIMILARITY = 0.985;

export type AttackCheck = { outcome: 'passed' | 'printed_photo' | 'injection' | 'not_checked'; details: Record<string, unknown> };

function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x > 0n) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);

/** Sequence checks over usable frames (every frame has a face, hash and embedding). */
export function sequenceAttack(frames: FrameAnalysis[], raw: Buffer[]): AttackCheck {
  if (hasDuplicateFrames(raw)) return { outcome: 'injection', details: { reason: 'duplicate_frames' } };
  let maxHamming = 0;
  let minSimilarity = 1;
  for (let i = 0; i < frames.length; i += 1) {
    for (let j = i + 1; j < frames.length; j += 1) {
      const [a, b] = [frames[i], frames[j]];
      if (!a.hash || !b.hash || !a.face || !b.face) continue;
      maxHamming = Math.max(maxHamming, hamming(a.hash, b.hash));
      minSimilarity = Math.min(minSimilarity, cosine(a.face.embedding, b.face.embedding));
    }
  }
  const details = {
    max_hamming: maxHamming,
    min_similarity: Number(minSimilarity.toFixed(4)),
    thresholds: { static_max_hamming: STATIC_MAX_HAMMING, static_min_similarity: STATIC_MIN_SIMILARITY },
  };
  if (maxHamming <= STATIC_MAX_HAMMING && minSimilarity >= STATIC_MIN_SIMILARITY) {
    return { outcome: 'printed_photo', details: { reason: 'no_inter_frame_change', ...details } };
  }
  return { outcome: 'passed', details };
}
