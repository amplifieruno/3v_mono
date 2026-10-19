import { describe, expect, it } from 'vitest';
import { insertOverride } from './support/access.js';
import { accessWorld, checkAccess, evaluate, insertGrant, publishPolicy } from './support/accessEngine.js';
import { createAccessPoint, createArea } from './support/facilities.js';
import { callFn } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Decision engine (slice 8 task 2): grants (single-use consumption) and emergency overrides. */

const usedAt = async (grant: string): Promise<string | null> => {
  const [row] = await runSqlRows(`select used_at from itap.access_grants where id = '${grant}'`);
  return row.used_at === 'NULL' ? null : row.used_at;
};

describe('evaluate_access: grants', () => {
  it('should grant through a valid grant for the access point or its area subtree, but not a revoked one', async () => {
    const w = await accessWorld();
    const door = await insertGrant(w);
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', reason: 'grant', grant_id: door, policy_version_id: null });
    expect(r.signals.decided_by).toBe('grant');
    await callFn(w.a, 'revoke_access_grant', { p_grant: door, p_reason: 'Left' }, 'id');
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).reason).toBe('no_rule');

    const child = await createArea(w.a, w.facility.id, 'Cage', w.area.id);
    const inner = await createAccessPoint(w.a, w.facility.id, child.id);
    const area = await insertGrant(w, { access_point_id: null, area_id: w.area.id });
    expect(await evaluate(w.orgA.id, inner.id, { profile: w.profile })).toMatchObject({ reason: 'grant', grant_id: area });
    // Outside the grant window.
    expect((await evaluate(w.orgA.id, inner.id, { profile: w.profile, at: new Date(Date.now() + 5 * 3600_000).toISOString() })).reason)
      .toBe('no_rule');
  });

  it('should let a matching deny version win over a valid grant', async () => {
    const w = await accessWorld();
    await insertGrant(w);
    const { version } = await publishPolicy(w, { profile_id: w.profile }, { facility_id: w.facility.id }, { effect: 'deny' });
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).toMatchObject({
      reason: 'policy_deny',
      policy_version_id: version,
      grant_id: null,
    });
  });

  it('should consume a single-use grant only when recording, prefer a reusable grant, and refuse a second use', async () => {
    const w = await accessWorld();
    const once = await insertGrant(w, { single_use: true });
    const sim = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(sim).toMatchObject({ reason: 'grant', grant_id: once });
    expect(await usedAt(once)).toBeNull();

    const rec = await evaluate(w.orgA.id, w.door.id, { profile: w.profile, record: true });
    expect(rec).toMatchObject({ reason: 'grant', grant_id: once });
    expect(await usedAt(once)).not.toBeNull();
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile, record: true })).reason).toBe('no_rule');

    const reusable = await insertGrant(w);
    const another = await insertGrant(w, { single_use: true });
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile, record: true })).toMatchObject({ grant_id: reusable });
    expect(await usedAt(another)).toBeNull();
  });

  it('should let exactly one of many concurrent decisions consume a single-use grant (Review Focus 1)', async () => {
    const w = await accessWorld();
    const once = await insertGrant(w, { single_use: true });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })),
    );
    const granted = results.filter((d) => d.result === 'granted');
    expect(granted).toHaveLength(1);
    expect(granted[0].grant_id).toBe(once);
    expect(results.filter((d) => d.result === 'denied').map((d) => d.reason)).toEqual(Array(7).fill('no_rule'));
    const [row] = await runSqlRows(`select count(*) as n from itap.access_decisions where grant_id = '${once}'`);
    expect(Number(row.n)).toBe(1);
  });
});

describe('evaluate_access: emergency overrides', () => {
  it('should deny everyone under lock_all even with a grant, and resume normal evaluation after it ends', async () => {
    const w = await accessWorld();
    const grant = await insertGrant(w);
    const lock = await insertOverride(w.orgA.id, w.facility.id, 'lock_all');
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'denied', reason: 'override_lock', override_id: lock, grant_id: null });
    expect(r.signals.overrides).toEqual([expect.objectContaining({ id: lock, mode: 'lock_all', applied: true })]);
    await runSql(`select set_config('itap.override_context', 'on', true);
      update itap.emergency_overrides set ended_at = now() where id = '${lock}'`);
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).toMatchObject({ reason: 'grant', grant_id: grant });
  });

  it('should unlock for anyone (even unknown) under unlock_all and let evacuation open exits only', async () => {
    const w = await accessWorld();
    const unlock = await insertOverride(w.orgA.id, w.facility.id, 'unlock_all');
    expect(await evaluate(w.orgA.id, w.door.id, {})).toMatchObject({ result: 'granted', reason: 'override_unlock', override_id: unlock });
    await runSql(`select set_config('itap.override_context', 'on', true);
      update itap.emergency_overrides set ended_at = now() where id = '${unlock}'`);

    const entry = await createAccessPoint(w.a, w.facility.id, w.area.id, { direction: 'in' });
    const exit = await createAccessPoint(w.a, w.facility.id, w.area.id, { direction: 'out' });
    const evac = await insertOverride(w.orgA.id, w.facility.id, 'evacuation');
    expect(await evaluate(w.orgA.id, exit.id, { profile: w.profile })).toMatchObject({ reason: 'override_evacuation', override_id: evac });
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).toMatchObject({ reason: 'override_evacuation' }); // both
    const fallthrough = await evaluate(w.orgA.id, entry.id, { profile: w.profile });
    expect(fallthrough).toMatchObject({ result: 'denied', reason: 'no_rule', override_id: null });
    expect(fallthrough.signals.overrides).toEqual([expect.objectContaining({ id: evac, applied: false })]);
  });

  it('should apply an area-limited override only inside its area subtrees', async () => {
    const w = await accessWorld();
    const other = await createArea(w.a, w.facility.id, 'Lobby');
    const lobbyDoor = await createAccessPoint(w.a, w.facility.id, other.id);
    const lock = await insertOverride(w.orgA.id, w.facility.id, 'lock_all');
    await runSql(`select set_config('itap.override_context', 'on', true);
      insert into itap.emergency_override_areas (organization_id, facility_id, override_id, area_id)
      values ('${w.orgA.id}', '${w.facility.id}', '${lock}', '${w.area.id}')`);
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).reason).toBe('override_lock');
    expect((await evaluate(w.orgA.id, lobbyDoor.id, { profile: w.profile })).reason).toBe('no_rule');
  });
});
