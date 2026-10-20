import { describe, expect, it } from 'vitest';
import { policyEpoch } from './support/access.js';
import { checkAccess, insertGrant } from './support/accessEngine.js';
import { accessWorld, endExpired, endOverrideFn, eventsOf, inMinutes, startOverride } from './support/accessOps.js';
import { asOrgAdmin } from './support/clients.js';
import { createArea, createFacility } from './support/facilities.js';
import { addMember, createTestUser, expectError } from './support/fixtures.js';
import { cronPayload, postTrigger } from './support/sending.js';
import { runSqlRows } from './support/sql.js';

/** Emergency overrides (slice 8 task 4): start / end functions, the end cron, events, audit, Review Focus 5. */

const OVERRIDE_TYPES = ['emergency_override_started', 'emergency_override_ended'];

describe('start_emergency_override / end_emergency_override', () => {
  it('should refuse a short justification, a bad ends_at, foreign areas and a non-member', async () => {
    const w = await accessWorld();
    const codes = async (p: Promise<unknown>): Promise<string> => (await expectError(p)).message;
    expect(await codes(startOverride(w.a, w.facility.id, 'lock_all', { justification: '  short   ' }))).toContain(
      'justification_required',
    );
    expect(await codes(startOverride(w.a, w.facility.id, 'lock_all', { ends_at: inMinutes(-1) }))).toContain(
      'override_ends_at_invalid',
    );
    expect(await codes(startOverride(w.a, w.facility.id, 'lock_all', { ends_at: inMinutes(24 * 60 + 5) }))).toContain(
      'override_ends_at_invalid',
    );
    const otherFacility = await createFacility(w.a);
    const foreignArea = await createArea(w.a, otherFacility.id, 'Elsewhere');
    expect(await codes(startOverride(w.a, w.facility.id, 'lock_all', { area_ids: [foreignArea.id] }))).toContain(
      'area_not_found',
    );
    expect(await codes(startOverride(w.b, w.facility.id, 'lock_all'))).toContain('facility_not_found');
    const suspended = await createTestUser();
    await addMember(w.orgA.id, suspended.id, 'suspended');
    expect(await codes(startOverride(asOrgAdmin(suspended.id, w.orgA.id), w.facility.id, 'lock_all'))).toContain(
      'member_required',
    );
    const [row] = await runSqlRows(`select count(*) as n from itap.emergency_overrides where organization_id = '${w.orgA.id}'`);
    expect(Number(row.n)).toBe(0);
  });

  it('should start with areas, emit the started event, audit as the caller and bump the urgent epoch', async () => {
    const w = await accessWorld();
    const before = await policyEpoch(w.orgA.id);
    const ov = await startOverride(w.a, w.facility.id, 'lock_all', { area_ids: [w.area.id, w.area.id] });
    expect(ov).toMatchObject({ mode: 'lock_all', started_by: w.user.id, ended_at: null });
    const [areas] = await runSqlRows(`select count(*) as n from itap.emergency_override_areas where override_id = '${ov.id}'`);
    expect(Number(areas.n)).toBe(1);
    const after = await policyEpoch(w.orgA.id);
    expect(after).toEqual({ epoch: before.epoch + 1, urgent: before.epoch + 1 });
    const events = await eventsOf(w.orgA.id, OVERRIDE_TYPES);
    expect(events).toEqual([
      expect.objectContaining({
        event_type: 'emergency_override_started',
        dedup_key: `override:${ov.id}:started`,
        payload: expect.objectContaining({ override_id: ov.id, mode: 'lock_all', area_ids: [w.area.id], started_by: w.user.id }),
      }),
    ]);
    const [audit] = await runSqlRows(`select action, user_id from itap.audit_log
      where entity = 'emergency_overrides' and entity_id = '${ov.id}'`);
    expect(audit).toMatchObject({ action: 'insert', user_id: w.user.id });
  });

  it('should require an end reason, end once, and record ended_by / end_reason with the ended event', async () => {
    const w = await accessWorld();
    const ov = await startOverride(w.a, w.facility.id, 'unlock_all');
    expect((await expectError(endOverrideFn(w.a, ov.id, '  '))).message).toContain('end_reason_required');
    expect((await expectError(endOverrideFn(w.b, ov.id, 'Drill over'))).message).toContain('emergency_override_not_found');
    const ended = await endOverrideFn(w.approver, ov.id, 'Drill over');
    expect(ended).toMatchObject({ ended_by: w.approverUser.id, end_reason: 'Drill over' });
    expect((await expectError(endOverrideFn(w.a, ov.id, 'Again'))).message).toContain('emergency_override_ended');
    const events = await eventsOf(w.orgA.id, OVERRIDE_TYPES);
    expect(events.map((e) => e.event_type)).toEqual(OVERRIDE_TYPES);
    expect(events[1].payload).toMatchObject({ ended_by: w.approverUser.id, end_reason: 'Drill over' });
    const [audit] = await runSqlRows(`select user_id from itap.audit_log
      where entity = 'emergency_overrides' and entity_id = '${ov.id}' and action = 'update'`);
    expect(audit.user_id).toBe(w.approverUser.id);
  });

  it('should allow overlapping active overrides and apply the documented order (lock_all before unlock_all)', async () => {
    const w = await accessWorld();
    await insertGrant(w);
    const unlock = await startOverride(w.a, w.facility.id, 'unlock_all');
    const lock = await startOverride(w.a, w.facility.id, 'lock_all', { area_ids: [w.area.id] });
    const d = await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile });
    expect(d).toMatchObject({ result: 'denied', reason: 'override_lock', override_id: lock.id });
    await endOverrideFn(w.a, lock.id, 'Lockdown lifted');
    expect(await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).toMatchObject({
      reason: 'override_unlock',
      override_id: unlock.id,
    });
  });
});

describe('Review Focus 5: a lock override denies a valid grant; manual end and expiry restore evaluation', () => {
  it('should deny a valid grant under lock_all and grant again after the manual end', async () => {
    const w = await accessWorld();
    const grant = await insertGrant(w);
    expect(await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).toMatchObject({ reason: 'grant' });
    const ov = await startOverride(w.a, w.facility.id, 'lock_all');
    expect(await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).toMatchObject({
      result: 'denied',
      reason: 'override_lock',
      override_id: ov.id,
      grant_id: null,
    });
    await endOverrideFn(w.a, ov.id, 'All clear');
    expect(await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).toMatchObject({
      result: 'granted',
      reason: 'grant',
      grant_id: grant,
    });
    expect((await eventsOf(w.orgA.id, OVERRIDE_TYPES)).map((e) => e.event_type)).toEqual(OVERRIDE_TYPES);
  });

  it('should end an expired override by the cron at its ends_at (ended_by NULL, expired), once', async () => {
    const w = await accessWorld();
    await insertGrant(w);
    const ov = await startOverride(w.a, w.facility.id, 'lock_all', { ends_at: new Date(Date.now() + 1500).toISOString() });
    expect((await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).reason).toBe('override_lock');
    // Not yet expired: nothing to end.
    expect(await endExpired(w.orgA.id)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 1800));
    // Expired but not closed yet: evaluation already ignores it.
    expect((await checkAccess(w.a, { access_point_id: w.door.id, profile_id: w.profile })).reason).toBe('grant');
    // The cron through the backend handler, then a redelivery and a direct call: one end, one event.
    const res = await postTrigger('end_emergency_overrides', cronPayload('end_emergency_overrides'));
    expect(res.status).toBe(200);
    expect(await endExpired(w.orgA.id)).toEqual([]);
    expect((await postTrigger('end_emergency_overrides', cronPayload('end_emergency_overrides'))).status).toBe(200);
    const [row] = await runSqlRows(`select ended_by, end_reason, ended_at = ends_at as at_ends from itap.emergency_overrides
      where id = '${ov.id}'`);
    expect(row).toMatchObject({ ended_by: 'NULL', end_reason: 'expired', at_ends: 't' });
    const events = await eventsOf(w.orgA.id, OVERRIDE_TYPES);
    expect(events.map((e) => e.event_type)).toEqual(OVERRIDE_TYPES);
    expect(events[1].payload).toMatchObject({ end_reason: 'expired', ended_by: null });
    expect(Date.parse(events[1].occurred_at)).toBe(Date.parse(ov.ends_at));
  });

  it('should end two overlapping expired overrides in one run (two-phase), each with its event', async () => {
    const w = await accessWorld();
    const soon = new Date(Date.now() + 1500).toISOString();
    const a = await startOverride(w.a, w.facility.id, 'lock_all', { ends_at: soon });
    const b = await startOverride(w.a, w.facility.id, 'unlock_all', { ends_at: soon, area_ids: [w.area.id] });
    await new Promise((resolve) => setTimeout(resolve, 1800));
    const before = await policyEpoch(w.orgA.id);
    const ended = await endExpired(w.orgA.id);
    expect(ended.sort()).toEqual([a.id, b.id].sort());
    expect(await endExpired(w.orgA.id)).toEqual([]);
    const events = await eventsOf(w.orgA.id, ['emergency_override_ended']);
    expect(events.map((e) => e.dedup_key).sort()).toEqual([`override:${a.id}:ended`, `override:${b.id}:ended`].sort());
    // Every end is urgent: exactly 2 bumps (this call ended both, so the real cron did not touch them).
    const after = await policyEpoch(w.orgA.id);
    expect(after.urgent).toBe(after.epoch);
    expect(after.epoch - before.epoch).toBe(2);
  });

  it('should not let the cron end overrides of another organization or before their ends_at', async () => {
    const w = await accessWorld();
    const ov = await startOverride(w.a, w.facility.id, 'evacuation');
    expect(await endExpired(w.orgB.id, inMinutes(120))).toEqual([]);
    // A scheduled time in the future is capped at now().
    expect(await endExpired(w.orgA.id, inMinutes(120))).toEqual([]);
    const [row] = await runSqlRows(`select ended_at from itap.emergency_overrides where id = '${ov.id}'`);
    expect(row.ended_at).toBe('NULL');
  });

  it('should keep override writes function-only (org_admin cannot insert directly)', async () => {
    const w = await accessWorld();
    const err = await expectError(
      w.a.request(`mutation { insert_emergency_overrides_one(object: {facility_id: "${w.facility.id}", mode: "lock_all",
        justification: "Direct insert attempt", ends_at: "${inMinutes(30)}"}) { id } }`),
    );
    expect(err.message).toContain('insert_emergency_overrides_one');
  });

  it('should let the seed-only override record past drills only by active members (started_by, ended_by)', async () => {
    const w = await accessWorld();
    const suspended = await createTestUser();
    await addMember(w.orgA.id, suspended.id, 'suspended');
    const outsider = await createTestUser();
    const drill = (startedBy: string, endedBy: string | null) =>
      runSqlRows(`select id from itap.seed_emergency_override('${w.orgA.id}', '${w.facility.id}', 'evacuation',
        'Quarterly fire drill', now() - interval '2 hours', now() - interval '1 hour', '${startedBy}',
        now() - interval '90 minutes', ${endedBy ? `'${endedBy}'` : 'null'}, 'Drill completed')`);
    await expect(drill(outsider.id, w.user.id)).rejects.toThrow(/member_required/);
    await expect(drill(suspended.id, w.user.id)).rejects.toThrow(/member_required/);
    await expect(drill(w.user.id, suspended.id)).rejects.toThrow(/member_required/);
    expect(await drill(w.user.id, w.approverUser.id)).toHaveLength(1);
    expect(await drill(w.user.id, null)).toHaveLength(1);
  });
});
