/**
 * Probe embeddings for dev-stack tests of face authentication (the seed's `authProbes.ts`): a
 * capture of a person simulated as a unit vector at an exact cosine similarity to their first
 * template and orthogonal to all of their templates, so the engine's best score is that similarity.
 */

const dot = (a: readonly number[], b: readonly number[]): number => a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);
const normalize = (v: readonly number[]): number[] => {
  const n = Math.sqrt(dot(v, v)) || 1;
  return v.map((x) => x / n);
};

/** A unit vector at cosine `similarity` to the first template and orthogonal to the rest (the seed's probeNear). */
export function probeNear(templates: readonly number[][], similarity: number): number[] {
  const basis: number[][] = [];
  for (const t of templates) {
    let v = [...t];
    for (const b of basis) {
      const d = dot(v, b);
      v = v.map((x, i) => x - d * (b[i] ?? 0));
    }
    if (Math.sqrt(dot(v, v)) > 1e-9) basis.push(normalize(v));
  }
  let u = Array.from({ length: templates[0]?.length ?? 0 }, () => Math.random() - 0.5);
  for (const b of basis) {
    const d = dot(u, b);
    u = u.map((x, i) => x - d * (b[i] ?? 0));
  }
  u = normalize(u);
  const t0 = normalize(templates[0] ?? []);
  const sin = Math.sqrt(1 - similarity * similarity);
  return normalize(t0.map((x, i) => similarity * x + sin * (u[i] ?? 0)));
}
