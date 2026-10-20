import { describe, expect, it } from 'vitest';
import type { FrameAnalysis } from './analysis.js';
import { meanEmbedding, sequenceReason } from './analysis.js';
import { sequenceAttack } from './liveness.js';

const unit = (i: number, mix = 0): number[] => Array.from({ length: 4 }, (_, k) => (k === i ? Math.sqrt(1 - mix * mix) : k === i + 1 ? mix : 0));
const frame = (index: number, hash: string, embedding: number[]): FrameAnalysis => ({
  index,
  faces: 1,
  hash,
  face: { bbox: [0, 0, 100, 100], score: 0.9, embedding },
  bbox: [0, 0, 100, 100],
  quality: 0.9,
});
const raw = (n: number) => Array.from({ length: n }, (_, i) => Buffer.from(`frame-${i}`));

describe('sequence attack heuristic', () => {
  it('should flag no inter-frame change (hashes within 2 bits and embeddings >= 0.985) as printed_photo', () => {
    const frames = [frame(0, 'ff00ff00ff00ff00', unit(0)), frame(1, 'ff00ff00ff00ff01', unit(0, 0.05)), frame(2, 'ff00ff00ff00ff03', unit(0, 0.1))];
    expect(sequenceAttack(frames, raw(3))).toMatchObject({ outcome: 'printed_photo', details: { reason: 'no_inter_frame_change', max_hamming: 2 } });
  });

  it('should pass when any pair changes enough (hash or embedding)', () => {
    const moved = [frame(0, 'ff00ff00ff00ff00', unit(0)), frame(1, 'ff00ff00ff00ff00', unit(0)), frame(2, 'ff00ff00ff00ff0f', unit(0))];
    expect(sequenceAttack(moved, raw(3)).outcome).toBe('passed');
    const changed = [frame(0, 'ff00ff00ff00ff00', unit(0)), frame(1, 'ff00ff00ff00ff00', unit(0, 0.3)), frame(2, 'ff00ff00ff00ff00', unit(0))];
    expect(sequenceAttack(changed, raw(3)).outcome).toBe('passed');
  });

  it('should flag byte-identical frames as injection', () => {
    const frames = [frame(0, '00', unit(0)), frame(1, 'ff', unit(1)), frame(2, '0f', unit(2))];
    expect(sequenceAttack(frames, [Buffer.from('a'), Buffer.from('b'), Buffer.from('a')])).toMatchObject({
      outcome: 'injection',
      details: { reason: 'duplicate_frames' },
    });
  });
});

describe('sequence quality helpers', () => {
  it('should take the first failing frame and average embeddings to a unit vector', () => {
    expect(sequenceReason([{ index: 0, faces: 1 }, { index: 1, faces: 0, reason: 'no_face' }, { index: 2, faces: 2, reason: 'multiple_faces' }])).toBe('no_face');
    expect(sequenceReason([{ index: 0, faces: 1 }])).toBeUndefined();
    const mean = meanEmbedding([frame(0, '0', [1, 0, 0, 0]), frame(1, '0', [0, 1, 0, 0])]);
    expect(Math.hypot(...mean)).toBeCloseTo(1, 6);
    expect(mean[0]).toBeCloseTo(Math.SQRT1_2, 6);
  });
});
