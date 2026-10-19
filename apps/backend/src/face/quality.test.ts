import { describe, expect, it } from 'vitest';
import type { ExtractedFace } from './insightFaceClient.js';
import { MIN_QUALITY, qualityScore } from './quality.js';

const face = (bbox: [number, number, number, number], score: number): ExtractedFace => ({ bbox, score, embedding: [] });

describe('qualityScore', () => {
  it('should stay within 0..1', () => {
    expect(qualityScore(face([0, 0, 400, 400], 1), 400, 400)).toBeLessThanOrEqual(1);
    expect(qualityScore(face([0, 0, 400, 400], 1), 400, 400)).toBeGreaterThan(0.95);
    expect(qualityScore(face([0, 0, 2, 2], 0.1), 400, 400)).toBeGreaterThanOrEqual(0);
  });

  it('should grow with the detection score', () => {
    const low = qualityScore(face([100, 100, 180, 200], 0.62), 640, 480);
    const high = qualityScore(face([100, 100, 180, 200], 0.9), 640, 480);
    expect(high).toBeGreaterThan(low);
  });

  it('should grow with the face size up to the recognizer input size', () => {
    const small = qualityScore(face([100, 100, 130, 140], 0.8), 640, 480);
    const large = qualityScore(face([100, 100, 200, 230], 0.8), 640, 480);
    expect(large).toBeGreaterThan(small);
  });

  it('should penalize a face cut off by the image border', () => {
    const inside = qualityScore(face([100, 100, 200, 230], 0.8), 640, 480);
    const cut = qualityScore(face([-50, 100, 50, 230], 0.8), 640, 480);
    expect(cut).toBeLessThan(inside);
  });

  it('should accept a typical enrollment photo and reject a tiny distant face', () => {
    // ~80 px face, detector score just above its threshold (a passport-like crop).
    expect(qualityScore(face([1, 5, 82, 117], 0.61), 83, 117)).toBeGreaterThanOrEqual(MIN_QUALITY);
    // ~25 px face from a wide camera frame.
    expect(qualityScore(face([846, 66, 872, 99], 0.65), 1280, 720)).toBeLessThan(MIN_QUALITY);
  });
});
