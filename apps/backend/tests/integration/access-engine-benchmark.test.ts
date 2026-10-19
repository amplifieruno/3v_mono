import { describe, expect, it } from 'vitest';
import { benchmarkSql, type BenchmarkStats } from './support/accessBenchmark.js';
import { runSqlRows } from './support/sql.js';

/**
 * Decision engine latency (SA_5 §3.4: p95 < 100 ms) on the seeded dev database (Nova Tower). The benchmark runs in
 * ONE run_sql transaction that is rolled back at the end (it raises its statistics as the error message), so the
 * policies, grants, decisions and events it creates never persist in the demo organization.
 */

const CALLS = 240;

describe('evaluate_access: latency benchmark (seeded Nova Tower)', () => {
  it('should keep the recorded decision latency p95 under 100 ms over >= 200 calls', async (ctx) => {
    const [org] = await runSqlRows(`select id from itap.organizations where slug = 'nova-tower'`);
    if (!org) ctx.skip();
    let stats: BenchmarkStats | null = null;
    try {
      await runSqlRows(benchmarkSql(org.id ?? '', CALLS));
    } catch (e) {
      const match = /ACCESS_BENCH (\{[^{}]*\})/.exec(String(e));
      if (!match) throw e;
      stats = JSON.parse(match[1].replace(/\\"/g, '"')) as BenchmarkStats;
    }
    expect(stats).not.toBeNull();
    const s = stats as BenchmarkStats;
    expect(s.calls).toBe(CALLS);
    expect(s.policies).toBeGreaterThanOrEqual(7);
    for (const path of ['policy_allow', 'policy_deny', 'grant', 'no_rule']) expect(s.reasons).toContain(`${path}=`);
    expect(s.single_use_consumed).toBeGreaterThan(0);
    expect(s.granted).toBeGreaterThan(0);
    expect(s.denied).toBeGreaterThan(0);
    expect(s.latency_p95_ms).toBeLessThan(100);
    expect(s.call_p95_ms).toBeLessThan(100);
  });
});
