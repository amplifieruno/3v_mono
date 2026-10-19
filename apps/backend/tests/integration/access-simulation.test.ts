import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { createDraft, createPolicyWithDraft } from './support/access.js';
import { accessWorld, evaluate, publishPolicy, writeCounts } from './support/accessEngine.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

/** Policy simulation (slice 8 task 4): historical decisions re-evaluated with a draft version; writes nothing. */

type Simulation = {
  version_id: string;
  decisions_in_period: number;
  evaluated: number;
  sampled: boolean;
  unchanged: number;
  granted_to_denied: number;
  denied_to_granted: number;
  reason_changed: number;
  skipped: number;
  samples: { decision_id: string; old_result: string; old_reason: string; new_result: string; new_reason: string }[];
};

async function simulate(client: HasuraClient, version: string, from: string, to: string, limit?: number): Promise<Simulation> {
  const data = await client.request<{ simulate_access_policy: Simulation[] }>(
    `query($a: simulate_access_policy_args!) { simulate_access_policy(args: $a) { version_id decisions_in_period evaluated
      sampled unchanged granted_to_denied denied_to_granted reason_changed skipped samples } }`,
    { a: { p_version: version, p_from: from, p_to: to, ...(limit ? { p_limit: limit } : {}) } },
  );
  return data.simulate_access_policy[0];
}

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

/** Employees allowed at the door; 3 granted decisions of the employee, 2 denied of a visitor, in the last 2 hours. */
async function history() {
  const w = await accessWorld();
  const visitor = (await insertOne(w.a, 'profiles', { first_name: 'Vic', last_name: 'Visitor', profile_type: 'visitor' })).id;
  const allow = await publishPolicy(w, { profile_type: 'employee' }, { access_point_id: w.door.id });
  for (const m of [110, 100, 90]) await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: ago(m), record: true });
  for (const m of [80, 70]) await evaluate(w.orgA.id, w.door.id, { profile: visitor, at: ago(m), record: true });
  return { w, visitor, allow };
}

describe('simulate_access_policy', () => {
  it('should count granted->denied for a deny draft replacing the enforced allow, with samples', async () => {
    const { w, allow } = await history();
    const draft = await createDraft(w.a, allow.policy);
    await updateByPk(w.a, 'access_policy_versions', draft.id, { effect: 'deny' });
    const sim = await simulate(w.a, draft.id, ago(180), ago(0));
    expect(sim).toMatchObject({
      version_id: draft.id,
      decisions_in_period: 5,
      evaluated: 5,
      sampled: false,
      unchanged: 2,
      granted_to_denied: 3,
      denied_to_granted: 0,
      reason_changed: 0,
      skipped: 0,
    });
    expect(sim.samples).toHaveLength(3);
    expect(sim.samples[0]).toMatchObject({ old_result: 'granted', old_reason: 'policy_allow', new_result: 'denied', new_reason: 'policy_deny' });
    expect((await simulate(w.a, draft.id, ago(180), ago(0), 1)).samples).toHaveLength(1);
    // Only the period: the two visitor decisions.
    expect(await simulate(w.a, draft.id, ago(85), ago(0))).toMatchObject({ evaluated: 2, unchanged: 2, granted_to_denied: 0 });
  });

  it('should count denied->granted for a new allow draft of another policy (added to the enforced set)', async () => {
    const { w, visitor } = await history();
    const { draft } = await createPolicyWithDraft(w.a, { profile_id: visitor }, { access_point_id: w.door.id });
    const sim = await simulate(w.a, draft.id, ago(180), ago(0));
    expect(sim).toMatchObject({ evaluated: 5, unchanged: 3, granted_to_denied: 0, denied_to_granted: 2 });
    expect(sim.samples.map((s) => `${s.old_reason}->${s.new_reason}`)).toEqual(['no_rule->policy_allow', 'no_rule->policy_allow']);
  });

  it('should write nothing (no transaction id assigned, no rows)', async () => {
    const { w, allow } = await history();
    const draft = await createDraft(w.a, allow.policy);
    await updateByPk(w.a, 'access_policy_versions', draft.id, { effect: 'deny' });
    const before = await writeCounts(w.orgA.id);
    const session = JSON.stringify({ 'x-hasura-organization-id': w.orgA.id, 'x-hasura-user-id': w.user.id, 'x-hasura-role': 'org_admin' });
    const [control] = await runSqlRows(`select txid_current(); select txid_current_if_assigned() as x`);
    expect(control.x).not.toBe('NULL');
    const [row] = await runSqlRows(`select granted_to_denied from itap.simulate_access_policy('${session}'::json, '${draft.id}',
        '${ago(180)}', '${ago(0)}', 20);
      select txid_current_if_assigned() as x`);
    expect(row.x).toBe('NULL');
    const [check] = await runSqlRows(`select granted_to_denied as n from itap.simulate_access_policy('${session}'::json, '${draft.id}',
        '${ago(180)}', '${ago(0)}', 20)`);
    expect(Number(check.n)).toBe(3);
    expect(await writeCounts(w.orgA.id)).toEqual(before);
    const [v] = await runSqlRows(`select status from itap.access_policy_versions where id = '${draft.id}'`);
    expect(v.status).toBe('draft');
  });

  it('should refuse a period over 31 days, a bad limit, and a version of another organization', async () => {
    const { w, allow } = await history();
    expect((await expectError(simulate(w.a, allow.version, ago(32 * 24 * 60), ago(0)))).message).toContain('simulation_period_invalid');
    expect((await expectError(simulate(w.a, allow.version, ago(0), ago(10)))).message).toContain('simulation_period_invalid');
    expect((await expectError(simulate(w.a, allow.version, ago(60), ago(0), 101))).message).toContain('limit_out_of_range');
    expect((await expectError(simulate(w.b, allow.version, ago(60), ago(0)))).message).toContain('access_policy_version_not_found');
    // The enforced version itself: nothing changes.
    expect(await simulate(w.a, allow.version, ago(180), ago(0))).toMatchObject({ evaluated: 5, unchanged: 5 });
  });

  it('should not be exposed as a mutation and needs an organization session', async () => {
    const { w, allow } = await history();
    await expectDenied(
      w.a.request(`mutation { simulate_access_policy(args: {p_version: "${allow.version}", p_from: "${ago(60)}", p_to: "${ago(0)}"}) { evaluated } }`),
      'simulate_access_policy',
    );
  });
});
