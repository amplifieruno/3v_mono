import { describe, expect, it } from 'vitest';
import { policyEpoch } from './support/access.js';
import { accessWorld, checkAccess, evaluate, publishPolicy, writeCounts } from './support/accessEngine.js';
import { createDevice } from './support/facilities.js';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, expectError } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { mergeInto } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Decision engine (slice 8 task 2): person resolution, risk, recording (decision + event), isolation. */

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString();

describe('evaluate_access: person resolution', () => {
  it('should deny unknown_person without identity and profile, and for an unlinked identity nothing allows', async () => {
    const w = await accessWorld();
    await publishPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id });
    expect(await evaluate(w.orgA.id, w.door.id, {})).toMatchObject({ result: 'denied', reason: 'unknown_person' });
    const stranger = await insertOne(w.a, 'identities', {});
    const r = await evaluate(w.orgA.id, w.door.id, { identity: stranger.id });
    expect(r).toMatchObject({ result: 'denied', reason: 'unknown_person' });
    expect(r.signals.risk.components.unknown_identity).toBe(0.4);
  });

  it('should resolve an identity to its effective identity and that identity profile', async () => {
    const w = await accessWorld();
    const { version } = await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id });
    const linked = await insertOne(w.a, 'identities', { profile_id: w.profile });
    const source = await insertOne(w.a, 'identities', {});
    expect((await evaluate(w.orgA.id, w.door.id, { identity: source.id })).reason).toBe('unknown_person');
    await mergeInto(w.a, linked.id, [source.id]);
    const r = await evaluate(w.orgA.id, w.door.id, { identity: source.id });
    expect(r).toMatchObject({ result: 'granted', policy_version_id: version });
    expect(r.signals.person).toMatchObject({ requested_identity_id: source.id, identity_id: linked.id, profile_id: w.profile });
  });

  it('should deny profile_inactive for a suspended profile unless an override unlocks', async () => {
    const w = await accessWorld();
    await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id });
    await updateByPk(w.a, 'profiles', w.profile, { status: 'suspended' });
    expect(await evaluate(w.orgA.id, w.door.id, { profile: w.profile })).toMatchObject({
      result: 'denied',
      reason: 'profile_inactive',
    });
  });
});

describe('evaluate_access: risk', () => {
  it('should turn an allow into risk_exceeded above max_risk from recent denials and device health', async () => {
    const w = await accessWorld();
    // One denial 5 minutes ago (recorded, no policy yet), one 20 minutes ago (outside the 10-minute window).
    await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: minutesAgo(5), record: true });
    await evaluate(w.orgA.id, w.door.id, { profile: w.profile, at: minutesAgo(20), record: true });
    const { version } = await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id }, { max_risk: 0.1 });
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'denied', reason: 'risk_exceeded', policy_version_id: version, risk_score: 0.15 });
    expect(r.signals.signals).toMatchObject({ recent_denials: 1 });
    expect(r.signals.risk.components).toMatchObject({ recent_denials: 0.15, over_capacity: 0, device_health: 0 });

    const terminal = await createDevice(w.a, w.facility.id, { device_type: 'access_terminal' });
    await runSql(`update itap.devices set health_status = 'critical' where id = '${terminal.id}';
      insert into itap.access_point_devices (organization_id, facility_id, access_point_id, device_id, role)
      values ('${w.orgA.id}', '${w.facility.id}', '${w.door.id}', '${terminal.id}', 'terminal')`);
    const withDevice = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(withDevice.risk_score).toBeCloseTo(0.45, 3);
    expect(withDevice.signals.signals).toMatchObject({ device_id: terminal.id, device_health: 'critical' });
  });

  it('should add the over-capacity component when the access point area is full', async () => {
    const w = await accessWorld();
    await updateByPk(w.a, 'areas', w.area.id, { capacity: 1 });
    const someone = await insertOne(w.a, 'identities', {});
    await runSql(`insert into itap.area_occupancy (organization_id, facility_id, area_id, identity_id, entered_at, last_seen_at)
      values ('${w.orgA.id}', '${w.facility.id}', '${w.area.id}', '${someone.id}', now(), now())`);
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r.signals.risk.components.over_capacity).toBe(0.3);
    expect(r.signals.signals.areas_over_capacity).toEqual([expect.objectContaining({ area_id: w.area.id, occupancy: 1, capacity: 1 })]);
  });
});

describe('check_access: recording', () => {
  it('should record the decision with epoch, latency and trace, and emit access_granted / access_denied', async () => {
    const w = await accessWorld();
    const denied = await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile });
    expect(denied).toMatchObject({ result: 'denied', reason: 'no_rule', profile_id: w.profile, facility_id: w.facility.id });
    const { version } = await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id });
    const epoch = await policyEpoch(w.orgA.id);
    const granted = await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile });
    expect(granted).toMatchObject({ result: 'granted', reason: 'policy_allow', policy_version_id: version, epoch: epoch.epoch });
    expect(Number(granted.latency_ms)).toBeGreaterThanOrEqual(0);
    expect(granted.signals.candidates[0]).toMatchObject({ version_id: version, decided: true });

    const events = await runSqlRows(`select event_type, access_decision_id, dedup_key, profile_id, access_point_id
      from itap.events where organization_id = '${w.orgA.id}' and event_type like 'access_%' order by occurred_at, event_type`);
    expect(events).toEqual([
      { event_type: 'access_denied', access_decision_id: denied.id, dedup_key: `decision:${denied.id}`, profile_id: w.profile, access_point_id: w.door.id },
      { event_type: 'access_granted', access_decision_id: granted.id, dedup_key: `decision:${granted.id}`, profile_id: w.profile, access_point_id: w.door.id },
    ]);
  });

  it('should write nothing when not recording', async () => {
    const w = await accessWorld();
    await publishPolicy(w, { profile_id: w.profile }, { access_point_id: w.door.id });
    const before = await writeCounts(w.orgA.id);
    const r = await evaluate(w.orgA.id, w.door.id, { profile: w.profile });
    expect(r).toMatchObject({ result: 'granted', decision_id: null });
    expect(await writeCounts(w.orgA.id)).toEqual(before);
  });

  it('should refuse ids of another organization and non-members', async () => {
    const w = await accessWorld();
    const ap = (await expectError(checkAccess(w.b, { access_point_id: w.door.id }))).message;
    expect(ap).toContain('access_point_not_found');
    const profileB = await insertOne(w.b, 'profiles', { first_name: 'Bea', last_name: 'B' });
    expect((await expectError(checkAccess(w.a, { access_point_id: w.door.id, profile_id: profileB.id }))).message).toContain(
      'profile_not_found',
    );
    const identityB = await insertOne(w.b, 'identities', {});
    expect((await expectError(checkAccess(w.a, { access_point_id: w.door.id, identity_id: identityB.id }))).message).toContain(
      'identity_not_found',
    );
    const deviceB = await createDevice(w.b, (await insertOne(w.b, 'facilities', { name: `FB ${Date.now()}` })).id);
    expect((await expectError(checkAccess(w.a, { access_point_id: w.door.id, device_id: deviceB.id }))).message).toContain(
      'device_not_found',
    );
    expect(await writeCounts(w.orgB.id)).toMatchObject({ decisions: 0 });
  });

  it('should refuse a suspended member and an identity linked to a different profile than the one given', async () => {
    const w = await accessWorld();
    const suspended = await createTestUser();
    await addMember(w.orgA.id, suspended.id, 'suspended');
    const e = await expectError(checkAccess(asOrgAdmin(suspended.id, w.orgA.id), { access_point_id: w.door.id }));
    expect(e.message).toContain('member_required');
    const other = await insertOne(w.a, 'profiles', { first_name: 'Other', last_name: 'Person' });
    const linked = await insertOne(w.a, 'identities', { profile_id: other.id });
    const mismatch = await expectError(
      checkAccess(w.a, { access_point_id: w.door.id, identity_id: linked.id, profile_id: w.profile }),
    );
    expect(mismatch.message).toContain('identity_profile_mismatch');
  });
});
