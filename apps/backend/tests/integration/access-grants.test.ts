import { describe, expect, it } from 'vitest';
import { accessWorld, createPolicyWithDraft, insertOverride, type AccessWorld } from './support/access.js';
import { createArea, createFacility } from './support/facilities.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

const GRANT_FIELDS = 'id profile_id area_id access_point_id single_use used_at revoked_at revoked_by revoke_reason granted_by';
type Grant = Record<string, string | boolean | null>;

const hour = (h: number): string => new Date(Date.now() + h * 3600_000).toISOString();

const grant = (w: AccessWorld, extra: Record<string, unknown> = {}): Promise<Grant> =>
  insertOne<Grant>(
    w.a,
    'access_grants',
    { profile_id: w.profile, access_point_id: w.door.id, valid_from: hour(-1), valid_until: hour(2), reason: 'Contractor visit', ...extra },
    GRANT_FIELDS,
  );

const revoke = (w: AccessWorld, id: string, reason = 'Left early'): Promise<Grant> =>
  callFn<Grant>(w.a, 'revoke_access_grant', { p_grant: id, p_reason: reason }, GRANT_FIELDS);

describe('access policy children: exactly-one and tenant isolation', () => {
  it('should require exactly one subject kind and exactly one target kind per row', async () => {
    const w = await accessWorld();
    const { draft } = await createPolicyWithDraft(w.a, { profile_type: 'employee' }, { facility_id: w.facility.id });
    const twoSubjects = await expectError(
      insertOne(w.a, 'access_policy_version_subjects', { version_id: draft.id, profile_id: w.profile, access_level: 'basic' }),
    );
    expect(twoSubjects.message).toContain('access_policy_version_subjects_exactly_one_subject');
    const noTarget = await expectError(insertOne(w.a, 'access_policy_version_targets', { version_id: draft.id }));
    expect(noTarget.message).toContain('access_policy_version_targets_exactly_one_target');
    const twoTargets = await expectError(
      insertOne(w.a, 'access_policy_version_targets', { version_id: draft.id, area_id: w.area.id, access_point_id: w.door.id }),
    );
    expect(twoTargets.message).toContain('access_policy_version_targets_exactly_one_target');
    const dup = await expectError(
      insertOne(w.a, 'access_policy_version_targets', { version_id: draft.id, facility_id: w.facility.id }),
    );
    expect(dup.message).toMatch(/access_policy_version_targets_facility_key|Uniqueness/);
    const badRisk = await expectError(updateByPk(w.a, 'access_policy_versions', draft.id, { max_risk: 1.5 }));
    expect(badRisk.message).toContain('access_policy_versions_max_risk_range');
    const badWindow = await expectError(
      updateByPk(w.a, 'access_policy_versions', draft.id, { valid_from: hour(2), valid_until: hour(1) }),
    );
    expect(badWindow.message).toContain('access_policy_versions_valid_window');
    const badSchedule = await expectError(updateByPk(w.a, 'access_policy_versions', draft.id, { schedule: [{ days: [9] }] }));
    expect(badSchedule.message).toContain('access_policy_versions_schedule_valid');
  });

  it('should refuse references into another organization (composite FKs)', async () => {
    const w = await accessWorld();
    const facilityB = await createFacility(w.b);
    const areaB = await createArea(w.b, facilityB.id, 'B lobby');
    const profileB = (await insertOne(w.b, 'profiles', { first_name: 'Bob', last_name: 'Other' })).id;
    const { draft } = await createPolicyWithDraft(w.a, { profile_type: 'employee' }, { facility_id: w.facility.id });
    for (const target of [{ facility_id: facilityB.id }, { area_id: areaB.id }]) {
      const e = await expectError(insertOne(w.a, 'access_policy_version_targets', { version_id: draft.id, ...target }));
      expect(e.message).toMatch(/foreign key|Foreign key/);
    }
    const subject = await expectError(insertOne(w.a, 'access_policy_version_subjects', { version_id: draft.id, profile_id: profileB }));
    expect(subject.message).toMatch(/foreign key|Foreign key/);
    const foreignGrant = await expectError(grant(w, { profile_id: profileB }));
    expect(foreignGrant.message).toMatch(/foreign key|Foreign key/);
    // A version of org A cannot be used as the parent of an org B child.
    const child = await expectError(insertOne(w.b, 'access_policy_version_subjects', { version_id: draft.id, profile_type: 'vip' }));
    expect(child.message).toMatch(/foreign key|Foreign key/);
  });
});

describe('access grants', () => {
  it('should stamp granted_by, require exactly one target and a valid window', async () => {
    const w = await accessWorld();
    const g = await grant(w);
    expect(g).toMatchObject({ granted_by: w.user.id, single_use: false, used_at: null, revoked_at: null });
    const both = await expectError(grant(w, { area_id: w.area.id }));
    expect(both.message).toContain('access_grants_exactly_one_target');
    const none = await expectError(grant(w, { access_point_id: null }));
    expect(none.message).toContain('access_grants_exactly_one_target');
    const window = await expectError(grant(w, { valid_from: hour(3) }));
    expect(window.message).toContain('access_grants_valid_window');
  });

  it('should be insert + select only for org_admin: no update, no delete, used_at read-only', async () => {
    const w = await accessWorld();
    const g = await grant(w);
    await expectDenied(updateByPk(w.a, 'access_grants', String(g.id), { reason: 'x' }), 'update_access_grants_by_pk');
    await expectDenied(
      w.a.request(`mutation($id: uuid!) { delete_access_grants_by_pk(id: $id) { id } }`, { id: g.id }),
      'delete_access_grants_by_pk',
    );
    await expectDenied(grant(w, { used_at: hour(0) }), 'used_at');
    await expectDenied(grant(w, { revoked_at: hour(0) }), 'revoked_at');
  });

  it('should revoke once through the function, recording who and why', async () => {
    const w = await accessWorld();
    const g = await grant(w);
    const r = await revoke(w, String(g.id));
    expect(r).toMatchObject({ revoked_by: w.user.id, revoke_reason: 'Left early' });
    expect(r.revoked_at).not.toBeNull();
    expect((await expectError(revoke(w, String(g.id)))).message).toContain('access_grant_revoked');
    expect((await expectError(callFn(w.b, 'revoke_access_grant', { p_grant: g.id, p_reason: 'x' }, 'id'))).message).toContain(
      'access_grant_not_found',
    );
  });

  it('should guard system writes: used_at only once on single-use grants, used grants never deleted', async () => {
    const w = await accessWorld();
    const multi = await grant(w);
    await expect(runSql(`update itap.access_grants set used_at = now() where id = '${multi.id}'`)).rejects.toThrow(
      /access_grants_used_single_use/,
    );
    const single = await grant(w, { single_use: true });
    await runSql(`update itap.access_grants set used_at = now() where id = '${single.id}'`);
    await expect(runSql(`update itap.access_grants set used_at = now() + interval '1 s' where id = '${single.id}'`)).rejects.toThrow(
      /access_grant_not_editable/,
    );
    await expect(runSql(`update itap.access_grants set reason = 'changed' where id = '${single.id}'`)).rejects.toThrow(
      /access_grant_not_editable/,
    );
    await expect(runSql(`update itap.access_grants set revoked_at = now() where id = '${single.id}'`)).rejects.toThrow(
      /access_grant_not_editable/,
    );
    await expect(runSql(`delete from itap.access_grants where id = '${single.id}'`)).rejects.toThrow(/access_grant_used/);
    // An unused grant may be removed by SQL (e.g. retention); never by org_admin.
    await runSql(`delete from itap.access_grants where id = '${multi.id}'`);
  });
});

describe('emergency overrides and decisions', () => {
  it('should write overrides only through the start/end functions and validate them', async () => {
    const w = await accessWorld();
    await expect(
      runSql(`insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, ends_at)
        values ('${w.orgA.id}', '${w.facility.id}', 'lock_all', 'Intruder on site', now() + interval '1 hour')`),
    ).rejects.toThrow(/emergency_override_function_only/);
    const flagged = (sql: string) => runSql(`select set_config('itap.override_context', 'on', true); ${sql}`);
    await expect(
      flagged(`insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, ends_at)
        values ('${w.orgA.id}', '${w.facility.id}', 'lock_all', 'short', now() + interval '1 hour')`),
    ).rejects.toThrow(/emergency_overrides_justification_length/);
    await expect(
      flagged(`insert into itap.emergency_overrides (organization_id, facility_id, mode, justification, ends_at)
        values ('${w.orgA.id}', '${w.facility.id}', 'lock_all', 'Intruder on site', now() + interval '25 hours')`),
    ).rejects.toThrow(/emergency_overrides_ends_at_window/);
    const id = await insertOverride(w.orgA.id, w.facility.id, 'lock_all');
    await expect(runSql(`update itap.emergency_overrides set ended_at = now() where id = '${id}'`)).rejects.toThrow(
      /emergency_override_function_only/,
    );
    await flagged(`insert into itap.emergency_override_areas (organization_id, facility_id, override_id, area_id)
      values ('${w.orgA.id}', '${w.facility.id}', '${id}', '${w.area.id}')`);
    await expect(
      runSql(`delete from itap.emergency_override_areas where override_id = '${id}'`),
    ).rejects.toThrow(/emergency_override_function_only/);
    await expect(flagged(`update itap.emergency_overrides set mode = 'unlock_all' where id = '${id}'`)).rejects.toThrow(
      /emergency_override_not_editable/,
    );
    await flagged(`update itap.emergency_overrides set ended_at = now() where id = '${id}'`);
    await expect(flagged(`update itap.emergency_overrides set ended_at = now() where id = '${id}'`)).rejects.toThrow(
      /emergency_override_not_editable/,
    );
    const seen = await w.a.request<{ emergency_overrides: { id: string; mode: string; emergency_override_areas: { area_id: string }[] }[] }>(
      `query { emergency_overrides { id mode emergency_override_areas { area_id } } }`,
    );
    expect(seen.emergency_overrides).toEqual([{ id, mode: 'lock_all', emergency_override_areas: [{ area_id: w.area.id }] }]);
    await expectDenied(
      w.a.request(`mutation { insert_emergency_overrides_one(object: {mode: "lock_all"}) { id } }`),
      'insert_emergency_overrides_one',
    );
    expect((await w.b.request<{ emergency_overrides: unknown[] }>(`query { emergency_overrides { id } }`)).emergency_overrides).toEqual([]);
  });

  it('should expose decisions read-only with the reason and result enums', async () => {
    const w = await accessWorld();
    const [d] = await runSqlRows(`insert into itap.access_decisions
      (organization_id, facility_id, access_point_id, profile_id, result, reason, signals, epoch, decided_at)
      values ('${w.orgA.id}', '${w.facility.id}', '${w.door.id}', '${w.profile}', 'denied', 'no_rule', '{"evaluated": []}', 0, now())
      returning id`);
    await expect(
      runSql(`insert into itap.access_decisions (organization_id, facility_id, access_point_id, result, reason, epoch)
        values ('${w.orgA.id}', '${w.facility.id}', '${w.door.id}', 'granted', 'bogus', 0)`),
    ).rejects.toThrow(/access_decisions_reason_fkey/);
    const seen = await w.a.request<{ access_decisions: { id: string; result: string; reason: string }[] }>(
      `query { access_decisions { id result reason } }`,
    );
    expect(seen.access_decisions).toEqual([{ id: d.id, result: 'denied', reason: 'no_rule' }]);
    await expectDenied(
      w.a.request(`mutation { insert_access_decisions_one(object: {result: "granted"}) { id } }`),
      'insert_access_decisions_one',
    );
    expect((await w.b.request<{ access_decisions: unknown[] }>(`query { access_decisions { id } }`)).access_decisions).toEqual([]);
    const reasons = await runSqlRows(`select value from itap.access_decision_reasons order by value`);
    expect(reasons.map((r) => r.value)).toEqual(
      expect.arrayContaining(['override_lock', 'override_unlock', 'policy_deny', 'policy_allow', 'grant', 'risk_exceeded', 'no_rule', 'unknown_person']),
    );
  });

  it('should let an organization cascade remove policies, pending versions, used grants, overrides and decisions', async () => {
    const w = await accessWorld();
    const { draft } = await createPolicyWithDraft(w.a, { profile_id: w.profile }, { access_point_id: w.door.id });
    await callFn(w.a, 'submit_access_policy_version', { p_version: draft.id }, 'id');
    const used = await grant(w, { single_use: true });
    await runSql(`update itap.access_grants set used_at = now() where id = '${used.id}'`);
    const override = await insertOverride(w.orgA.id, w.facility.id, 'lock_all');
    await runSql(`insert into itap.access_decisions (organization_id, facility_id, access_point_id, result, reason, grant_id,
      override_id, policy_version_id, epoch) values ('${w.orgA.id}', '${w.facility.id}', '${w.door.id}', 'denied',
      'override_lock', '${used.id}', '${override}', '${draft.id}', 1)`);
    await runSql(`delete from itap.organizations where id = '${w.orgA.id}'`);
    const left = await runSqlRows(`select (select count(*) from itap.access_policy_versions where organization_id = '${w.orgA.id}')
      + (select count(*) from itap.access_grants where organization_id = '${w.orgA.id}')
      + (select count(*) from itap.access_decisions where organization_id = '${w.orgA.id}') as n`);
    expect(left).toEqual([{ n: '0' }]);
  });
});
