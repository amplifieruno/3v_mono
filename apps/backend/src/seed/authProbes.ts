import type { Random } from './random.js';

/**
 * Probe embeddings of the seeded authentication history (no InsightFace call): a capture of a person is simulated as
 * a unit vector at an exact cosine similarity to their first stored template, rotated towards a random direction
 * orthogonal to all of their templates — so its similarity to the person's other templates is at most the target,
 * and the engine's best comparison score equals the target. The target is chosen per scenario relative to the app
 * threshold (above it, inside the partial band, or a genuine capture of someone else).
 */

const dot = (a: number[], b: number[]): number => a.reduce((sum, x, i) => sum + x * b[i], 0);

function normalize(v: number[]): number[] {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
}

/** Standard normal sample (Box-Muller) from the seed's deterministic stream. */
function gaussian(rng: Random): number {
  const u = Math.max(rng.next(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

export function probeNear(templates: number[][], similarity: number, rng: Random): number[] {
  if (templates.length === 0) throw new Error('seed: probe needs at least one template');
  const basis: number[][] = [];
  for (const t of templates) {
    let v = [...t];
    for (const b of basis) {
      const d = dot(v, b);
      v = v.map((x, i) => x - d * b[i]);
    }
    if (Math.sqrt(dot(v, v)) > 1e-9) basis.push(normalize(v));
  }
  let u = Array.from({ length: templates[0].length }, () => gaussian(rng));
  for (const b of basis) {
    const d = dot(u, b);
    u = u.map((x, i) => x - d * b[i]);
  }
  u = normalize(u);
  const t0 = normalize(templates[0]);
  const sin = Math.sqrt(Math.max(0, 1 - similarity * similarity));
  return normalize(t0.map((x, i) => similarity * x + sin * u[i]));
}

export function parseVector(literal: string): number[] {
  return literal.replace(/[[\]\s]/g, '').split(',').map(Number);
}

export function formatVector(values: number[]): string {
  return `[${values.map((v) => Number(v.toFixed(7))).join(',')}]`;
}
