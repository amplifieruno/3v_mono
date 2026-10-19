import { describe, expect, it } from 'vitest';
import { createDraft } from './support/access.js';
import { accessWorld, evaluate, publishPolicy, writeCounts } from './support/accessEngine.js';
import { createAccessPoint, createArea } from './support/facilities.js';
import { insertOne, updateByPk } from './support/operations.js';
import { mergeInto } from './support/segments.js';
import { runSql } from './support/sql.js';

/** Decision engine (slice 8 task 2): policy versions — matching, ordering, schedule, simulation substitution. */

describe('evaluate_access: policy versions', () => {
  it('should deny with no_rule when nothing applies, with an empty candidate list in the trace', async () => {
    const w = await accessWorld();
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'denied', reason: 'no_rule', policy_version_id: null, decision_id: null });
    expect(r.signals.candidates).toEqual([]);
    expect(r.signals.decided_by).toBe('default');
  });

  it('should grant through a matching allow version and trace subject, target and schedule', async () => {
    const w = await accessWorld();
    const { version } = await publishPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id });
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', reason: 'policy_allow', policy_version_id: version });
    expect(r.signals.candidates).toEqual([
      expect.objectContaining({
        version_id: version,
        effect: 'allow',
        subject: 'profile_type',
        target: 'facility',
        valid: true,
        schedule: 'always',
        matched: true,
        decided: true,
        simulated: false,
      }),
    ]);
  });

  it('should let a deny beat an allow of equal priority deterministically, the trace showing both (Review Focus 2)', async () => {
    const w = await accessWorld();
    const allow = await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id }, { priority: 300 });
    const deny = await publishPolicy(w, { profile_type: 'employee' }, { area_id: w.area.id }, { effect: 'deny', priority: 300 });
    for (let i = 0; i < 3; i += 1) {
      const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
      expect(r).toMatchObject({ result: 'denied', reason: 'policy_deny', policy_version_id: deny.version });
      expect(r.signals.candidates.map((c) => [c.version_id, c.effect, c.matched, c.decided])).toEqual([
        [deny.version, 'deny', true, true],
        [allow.version, 'allow', true, false],
      ]);
    }
    // A higher-priority allow wins over the deny.
    const top = await publishPolicy(w, { access_level: 'basic' }, { facility_id: w.facility.id }, { priority: 500 });
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', reason: 'policy_allow', policy_version_id: top.version });
    expect(r.signals.candidates.map((c) => c.version_id)).toEqual([top.version, deny.version, allow.version]);
  });

  it('should match area targets on the subtree only and access_level subjects by rank', async () => {
    const w = await accessWorld();
    const child = await createArea(w.a, w.facility.id, 'Rack row', w.area.id);
    const sibling = await createArea(w.a, w.facility.id, 'Canteen');
    const inner = await createAccessPoint(w.a, w.facility.id, child.id);
    const outer = await createAccessPoint(w.a, w.facility.id, sibling.id);
    const { version } = await publishPolicy(w, { access_level: 'standard' }, { area_id: w.area.id });

    expect((await evaluate(w.orgA.id, inner.id, { profile: w.profile })).reason).toBe('no_rule'); // basic < standard
    await updateByPk(w.a, 'profiles', w.profile, { access_level: 'elevated' });
    const r = await evaluate(w.orgA.id, inner.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', policy_version_id: version });
    expect(r.signals.candidates[0]).toMatchObject({ subject: 'access_level', target: 'area' });
    const miss = await evaluate(w.orgA.id, outer.id, { profile: w.profile });
    expect(miss.reason).toBe('no_rule');
    expect(miss.signals.candidates[0]).toMatchObject({ subject: 'access_level', target: null, matched: false });
  });

  it('should evaluate segment membership at the decision instant (added_at <= at < removed_at)', async () => {
    const w = await accessWorld();
    const segment = await insertOne(w.a, 'segments', { name: `IT ${Date.now()}`, kind: 'manual', target: 'profiles' });
    await runSql(`insert into itap.segment_members (organization_id, segment_id, target, profile_id, source, added_at, removed_at)
      values ('${w.orgA.id}', '${segment.id}', 'profiles', '${w.profile}', 'manual', '2026-01-10T00:00:00Z', '2026-02-10T00:00:00Z')`);
    const { version } = await publishPolicy(w, { segment_id: segment.id }, { access_point_id: w.door.id });
    const at = (iso: string) => evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: iso });
    expect((await at('2026-01-09T23:59:59Z')).reason).toBe('no_rule');
    expect(await at('2026-01-10T00:00:00Z')).toMatchObject({ reason: 'policy_allow', policy_version_id: version });
    expect((await at('2026-02-09T23:59:59Z')).reason).toBe('policy_allow');
    expect((await at('2026-02-10T00:00:00Z')).reason).toBe('no_rule');
  });

  it('should match identity segments for a profile-only request through the profile identities (effective, at the instant)', async () => {
    const w = await accessWorld();
    const face = await insertOne(w.a, 'identities', { profile_id: w.profile });
    const allowSeg = await insertOne(w.a, 'segments', { name: `Faces ${Date.now()}`, kind: 'manual', target: 'identities' });
    const denySeg = await insertOne(w.a, 'segments', { name: `Banned ${Date.now()}`, kind: 'manual', target: 'identities' });
    await runSql(`insert into itap.segment_members (organization_id, segment_id, target, identity_id, source, added_at)
      values ('${w.orgA.id}', '${allowSeg.id}', 'identities', '${face.id}', 'manual', '2026-01-01T00:00:00Z')`);
    const allow = await publishPolicy(w, { segment_id: allowSeg.id }, { access_point_id: w.door.id });
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', policy_version_id: allow.version });
    expect(r.signals.candidates[0]).toMatchObject({ subject: 'segment' });
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: '2025-12-31T00:00:00Z' })).reason).toBe('no_rule');

    // A deny on an identity segment cannot be bypassed by presenting the profile (even via a merged-away face).
    const old = await insertOne(w.a, 'identities', {});
    await runSql(`insert into itap.segment_members (organization_id, segment_id, target, identity_id, source, added_at)
      values ('${w.orgA.id}', '${denySeg.id}', 'identities', '${face.id}', 'manual', '2026-01-01T00:00:00Z')`);
    const deny = await publishPolicy(w, { segment_id: denySeg.id }, { facility_id: w.facility.id }, { effect: 'deny', priority: 900 });
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).toMatchObject({
      reason: 'policy_deny',
      policy_version_id: deny.version,
    });
    await mergeInto(w.a, face.id, [old.id]);
    expect((await evaluate(w.orgA.id, w.door.id, { identity: old.id })).reason).toBe('policy_deny');
  });

  it('should honour valid_from / valid_until and report outside_schedule when only the schedule failed', async () => {
    const w = await accessWorld();
    await publishPolicy(
      w,
      { profile_id: w.profile },
      { access_point_id: w.door.id },
      { valid_from: '2026-03-01T00:00:00Z', valid_until: '2026-04-01T00:00:00Z' },
    );
    const before = await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: '2026-02-28T12:00:00Z' });
    expect(before.reason).toBe('no_rule');
    expect(before.signals.candidates[0]).toMatchObject({ valid: false, matched: false });
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: '2026-03-15T12:00:00Z' })).reason).toBe('policy_allow');

    // Facility is UTC: weekdays 09:00-17:00 only.
    const schedule = [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00' }];
    const { version } = await publishPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id }, { schedule });
    const night = await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: '2026-05-12T20:00:00Z' }); // Tuesday
    expect(night).toMatchObject({ result: 'denied', reason: 'outside_schedule', policy_version_id: null });
    expect(night.signals.candidates.find((c) => c.version_id === version)).toMatchObject({ schedule: 'out', matched: false });
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: '2026-05-12T10:00:00Z' })).reason).toBe('policy_allow');
  });

  it('should substitute a draft for its policy current version (p_override_version) without writing anything', async () => {
    const w = await accessWorld();
    const { policy, version } = await publishPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id });
    const draft = await createDraft(w.a, policy, version);
    await updateByPk(w.a, 'access_policy_versions', draft.id, { effect: 'deny' });
    const before = await writeCounts(w.orgA.id);

    const sim = await evaluate(w.orgA.id, w.door.id, { profile: w.profile, overrideVersion: draft.id });
    expect(sim).toMatchObject({ result: 'denied', reason: 'policy_deny', policy_version_id: draft.id, decision_id: null });
    expect(sim.signals.candidates.map((c) => [c.version_id, c.simulated])).toEqual([[draft.id, true]]);
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).policy_version_id).toBe(version);

    // A draft of a policy that was never published is added to the candidates.
    const fresh = await insertOne(w.a, 'access_policies', { name: `Fresh ${Date.now()}` });
    const freshDraft = await insertOne(w.a, 'access_policy_versions', {
      policy_id: fresh.id,
      effect: 'deny',
      priority: 900,
      access_policy_version_subjects: { data: [{ profile_id: w.profile }] },
      access_policy_version_targets: { data: [{ access_point_id: w.door.id }] },
    });
    const added = await evaluate(w.orgA.id, w.door.id, { profile: w.profile, overrideVersion: freshDraft.id });
    expect(added).toMatchObject({ reason: 'policy_deny', policy_version_id: freshDraft.id });
    expect(added.signals.candidates.map((c) => c.version_id)).toEqual([freshDraft.id, version]);
    expect(await writeCounts(w.orgA.id)).toEqual(before);
  });

  it('should ignore archived policies and another organization versions', async () => {
    const w = await accessWorld();
    const { policy } = await publishPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id });
    await runSql(`select itap.archive_access_policy(json_build_object('x-hasura-organization-id', '${w.orgA.id}',
      'x-hasura-user-id', '${w.user.id}'), '${policy}')`);
    expect((await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).signals.candidates).toEqual([]);
    const otherDraft = await insertOne(w.b, 'access_policies', { name: `B ${Date.now()}` });
    const bVersion = await insertOne(w.b, 'access_policy_versions', { policy_id: otherDraft.id });
    await expect(evaluate(w.orgA.id, w.door.id, { profile: w.profile, overrideVersion: bVersion.id })).rejects.toThrow(
      /access_policy_version_not_found/,
    );
  });
});
