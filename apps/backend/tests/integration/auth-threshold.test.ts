import { describe, expect, it } from 'vitest';
import { bind, decide, decideWorld, similarTo } from './support/authDecide.js';
import { createApp } from './support/authService.js';
import { runSqlRows } from './support/sql.js';

async function scalar(sql: string): Promise<number> {
  const [r] = await runSqlRows(`select (${sql}) as v`);
  return Number(r.v);
}

describe('auth thresholds', () => {
  it('should follow the population floor table', async () => {
    const cases: [number, number][] = [
      [0, 0.5],
      [100, 0.5],
      [101, 0.55],
      [1000, 0.55],
      [1001, 0.6],
      [10000, 0.6],
      [10001, 0.65],
      [5000000, 0.65],
    ];
    for (const [n, floor] of cases) expect(await scalar(`itap.auth_threshold_floor(${n})`), `n=${n}`).toBe(floor);
  });

  it('should clamp max(app, floor, request) to [min, max], raise-only, with the floor winning over max', async () => {
    const eff = (app: number, min: number, max: number, floor: number, req: string): Promise<number> =>
      scalar(`itap.auth_effective_threshold(${app}, ${min}, ${max}, ${floor}, ${req}::numeric)`);
    expect(await eff(0.6, 0.5, 0.9, 0.5, 'null')).toBe(0.6);
    expect(await eff(0.5, 0.5, 0.9, 0.55, 'null')).toBe(0.55);
    expect(await eff(0.6, 0.5, 0.9, 0.5, '0.7')).toBe(0.7);
    expect(await eff(0.6, 0.5, 0.9, 0.5, '0.3')).toBe(0.6);
    expect(await eff(0.6, 0.5, 0.9, 0.5, '0.99')).toBe(0.9);
    expect(await eff(0.5, 0.5, 0.6, 0.65, 'null')).toBe(0.65);
    expect(await eff(0.5, 0.5, 0.6, 0.65, '0.9')).toBe(0.65);
    await expect(eff(0.6, 0.5, 0.9, 0.5, '1.5')).rejects.toThrow(/auth_threshold_invalid/);
    await expect(eff(0.6, 0.5, 0.9, 0.5, '-0.1')).rejects.toThrow(/auth_threshold_invalid/);
  });

  it('should apply the threshold in force to decisions; a request can only raise it (Review Focus 1)', async () => {
    const w = await decideWorld();
    const probe = similarTo(0, 1, 0.65);
    const base = await decide(w.org, w.app.id, { session: await w.session(), embedding: probe });
    expect(base).toMatchObject({ outcome: 'success', threshold_used: 0.6, population_size: 1 });
    const lowered = await decide(w.org, w.app.id, { session: await w.session(), embedding: probe, requestThreshold: 0.2 });
    expect(lowered.threshold_used).toBe(0.6);
    const raised = await decide(w.org, w.app.id, { session: await w.session(), embedding: probe, requestThreshold: 0.7 });
    expect(raised).toMatchObject({ outcome: 'partial_match', threshold_used: 0.7 });
    const capped = await decide(w.org, w.app.id, { session: await w.session(), embedding: probe, requestThreshold: 0.99 });
    expect(capped.threshold_used).toBe(0.9);
  });

  it('should use the fixed verification floor 0.55 regardless of population and app threshold', async () => {
    const w = await decideWorld();
    const low = await createApp(w.a, { threshold: 0.5, threshold_min: 0.5, threshold_max: 0.9 });
    await bind(w.org, low.id, { segments: [w.segment.id], modes: ['identification', 'verification'] });
    const probe = similarTo(0, 1, 0.52);
    const ident = await decide(w.org, low.id, { session: await w.session({ application_id: low.id }), embedding: probe });
    expect(ident).toMatchObject({ outcome: 'success', threshold_used: 0.5 });
    const verify = await decide(w.org, low.id, {
      session: await w.session({ application_id: low.id, mode: 'verification', claimed_identity_id: w.person }),
      mode: 'verification',
      claimed: w.person,
      embedding: probe,
    });
    expect(verify).toMatchObject({ outcome: 'partial_match', threshold_used: 0.55 });
  });
});
