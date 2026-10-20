import { describe, expect, it } from 'vitest';
import { authBenchmarkSql, type AuthBenchmarkStats } from './support/authBenchmark.js';
import { runSqlRows } from './support/sql.js';

/**
 * auth_decide latency on the seeded dev database (Nova Tower). One run_sql transaction, rolled back at the end (the
 * block raises its statistics), so the app, sessions, attempts and events it creates never persist.
 */

const CALLS = 240;

describe('auth_decide: latency benchmark (seeded Nova Tower)', () => {
  it('should keep the recorded decision p95 under 100 ms (SA_6 budget: 2 s at the boundary) over >= 200 calls', async (ctx) => {
    const [org] = await runSqlRows(`select id from itap.organizations where slug = 'nova-tower'`);
    if (!org) ctx.skip();
    let stats: AuthBenchmarkStats | null = null;
    try {
      await runSqlRows(authBenchmarkSql(org.id ?? '', CALLS));
    } catch (e) {
      const match = /AUTH_BENCH (\{[^{}]*\})/.exec(String(e));
      if (!match) throw e;
      stats = JSON.parse(match[1].replace(/\\"/g, '"')) as AuthBenchmarkStats;
    }
    expect(stats).not.toBeNull();
    const s = stats as AuthBenchmarkStats;
    expect(s.calls).toBe(CALLS);
    expect(s.population).toBeGreaterThan(0);
    for (const outcome of [s.success, s.partial_match, s.failure]) expect(outcome, JSON.stringify(s)).toBeGreaterThan(0);
    expect(s.verification).toBe(CALLS / 3);
    expect(s.narrowed).toBe(CALLS / 4);
    expect(s.call_p95_ms, JSON.stringify(s)).toBeLessThan(100);
  });
});
