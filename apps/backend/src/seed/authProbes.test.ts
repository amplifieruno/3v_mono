import { describe, expect, it } from 'vitest';
import { formatVector, parseVector, probeNear } from './authProbes.js';
import { seededRandom } from './random.js';

const DIM = 512;
const unit = (v: number[]): number[] => {
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i], 0);

function randomUnit(key: string): number[] {
  const rng = seededRandom(key);
  return unit(Array.from({ length: DIM }, () => rng.next() - 0.5));
}

describe('probeNear', () => {
  const t1 = randomUnit('a');
  // A second template of the same person: close to the first.
  const t2 = unit(t1.map((x, i) => x + 0.6 * randomUnit('b')[i]));

  it('should return a unit vector exactly `similarity` away from the first template', () => {
    for (const target of [0.95, 0.66, 0.55, 0.3]) {
      const p = probeNear([t1, t2], target, seededRandom(`p${target}`));
      expect(Math.hypot(...p)).toBeCloseTo(1, 6);
      expect(dot(p, t1)).toBeCloseTo(target, 6);
    }
  });

  it('should never be closer to another template of the person than to the first one', () => {
    for (const target of [0.95, 0.6, 0.53]) {
      const p = probeNear([t1, t2], target, seededRandom(`q${target}`));
      expect(dot(p, t2)).toBeLessThanOrEqual(target + 1e-9);
    }
  });

  it('should be deterministic for the same random stream', () => {
    expect(probeNear([t1], 0.7, seededRandom('x'))).toEqual(probeNear([t1], 0.7, seededRandom('x')));
  });
});

describe('vector literals', () => {
  it('should round-trip a pgvector literal', () => {
    const v = [0.125, -0.5, 0.25];
    expect(parseVector(formatVector(v))).toEqual(v);
    expect(parseVector('[1, 2,3]')).toEqual([1, 2, 3]);
  });
});
