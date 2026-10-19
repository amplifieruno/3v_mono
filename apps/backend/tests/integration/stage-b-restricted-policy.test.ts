import { describe, expect, it } from 'vitest';
import { updateByPk } from './support/operations.js';
import { runSql } from './support/sql.js';
import { evaluate, orgEvents } from './support/stageB.js';
import {
  accessTrackingWorld,
  areaAccessAllowed,
  person,
  publishTrackingPolicy,
  trackingGrant,
} from './support/stageBAccess.js';
import { at, detect } from './support/tracking.js';

/** Stage B (slice 8 task 3): restricted_area_entry by access policy / grant, rank comparison as the fallback. */

const restricted = async (org: string) =>
  (await orgEvents(org)).filter((e) => e.event_type === 'restricted_area_entry');

describe('Stage B: restricted_area_entry by policy', () => {
  it('should allow a person a policy authorizes for the area and report an unauthorized visitor', async () => {
    const w = await accessTrackingWorld();
    // The policy governs Zone A; its rank (secure) no longer applies there.
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'secure' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { area_id: w.zone.id });
    const emp = await person(w.a, { profile_type: 'employee', access_level: 'basic' });
    const visitor = await person(w.a, { profile_type: 'visitor' });
    await evaluate((await detect(w.orgA.id, w.floorCam, emp.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, visitor.identity, 1)).id);
    const events = await restricted(w.orgA.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      identity_id: visitor.identity,
      profile_id: visitor.profile,
      area_id: w.zone.id,
      severity: 'high',
      payload: expect.objectContaining({ basis: 'policy', profile_type: 'visitor' }),
    });
    expect(events[0].dedup_key).toMatch(new RegExp(`^session:.+:restricted_area_entry:${w.zone.id}$`));
  });

  it('should authorize through a valid grant for an ancestor area, but not a revoked or expired one', async () => {
    const w = await accessTrackingWorld();
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { facility_id: w.facility.id });
    const granted = await person(w.a, { profile_type: 'visitor' });
    const revoked = await person(w.a, { profile_type: 'visitor' });
    const expired = await person(w.a, { profile_type: 'visitor' });
    await trackingGrant(w.a, granted.profile, { area_id: w.floor.id });
    const r = await trackingGrant(w.a, revoked.profile, { area_id: w.floor.id });
    // Revoked before the detection time (the test clock is in the past; revocation is evaluated as of `at`).
    await runSql(`select set_config('itap.access_grant_context', 'on', true);
      update itap.access_grants set revoked_at = '${at(-60)}', revoke_reason = 'Visit cancelled' where id = '${r}'`);
    await trackingGrant(w.a, expired.profile, { area_id: w.floor.id }, -7200, -60);
    for (const [i, p] of [granted, revoked, expired].entries()) {
      await evaluate((await detect(w.orgA.id, w.floorCam, p.identity, i)).id);
    }
    expect((await restricted(w.orgA.id)).map((e) => e.profile_id).sort()).toEqual([revoked.profile, expired.profile].sort());
  });

  it('should let a higher-priority deny covering the area win over an allow and over a grant', async () => {
    const w = await accessTrackingWorld();
    const contractor = await person(w.a, { profile_type: 'contractor' });
    await publishTrackingPolicy(w, { profile_id: contractor.profile }, { area_id: w.floor.id }, { priority: 10 });
    await publishTrackingPolicy(w, { profile_type: 'contractor' }, { area_id: w.zone.id }, { effect: 'deny', priority: 50 });
    await trackingGrant(w.a, contractor.profile, { area_id: w.zone.id });
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, contractor.identity, null, 0)).toBe(false);
    // The allow alone still covers the rest of the floor.
    expect(await areaAccessAllowed(w.orgA.id, w.floor.id, contractor.identity, null, 0)).toBe(true);
    await evaluate((await detect(w.orgA.id, w.floorCam, contractor.identity, 0)).id);
    expect((await restricted(w.orgA.id)).map((e) => e.profile_id)).toEqual([contractor.profile]);
  });

  it('should treat an unknown face, an inactive profile and an allow outside its window as unauthorized', async () => {
    const w = await accessTrackingWorld();
    await publishTrackingPolicy(w, { access_level: 'basic' }, { facility_id: w.facility.id }, { valid_from: at(600) });
    const later = await person(w.a, { profile_type: 'employee' });
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, later.identity, null, 0)).toBe(false);
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, later.identity, null, 700)).toBe(true);
    const suspended = await person(w.a, { status: 'suspended' });
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, null, suspended.profile, 700)).toBe(false);
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, w.identity, null, 700)).toBe(false);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 700)).id);
    expect(await restricted(w.orgA.id)).toEqual([
      expect.objectContaining({ identity_id: w.identity, payload: expect.objectContaining({ basis: 'policy' }) }),
    ]);
  });

  it('should fall back to the access-rank comparison where no policy governs the area', async () => {
    const w = await accessTrackingWorld();
    // A policy on the entrance door governs the Lobby only; Zone A stays rank-based.
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.entranceDoor.id });
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'secure' });
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, w.identity, null, 0)).toBeNull();
    expect(await areaAccessAllowed(w.orgA.id, w.lobby.id, w.identity, null, 0)).toBe(false);
    const elevated = await person(w.a, { profile_type: 'visitor', access_level: 'elevated' });
    await evaluate((await detect(w.orgA.id, w.floorCam, elevated.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 1)).id);
    const events = await restricted(w.orgA.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      identity_id: w.identity,
      payload: expect.objectContaining({ basis: 'rank', area_access_level: 'secure', clearance: null }),
    });
  });

  it('should keep the rank comparison when the organization has no enforced policy', async () => {
    const w = await accessTrackingWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'restricted' });
    const visitor = await person(w.a, { profile_type: 'visitor', access_level: 'standard' });
    expect(await areaAccessAllowed(w.orgA.id, w.zone.id, visitor.identity, null, 0)).toBeNull();
    await evaluate((await detect(w.orgA.id, w.floorCam, visitor.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 1)).id);
    expect((await restricted(w.orgA.id)).map((e) => e.identity_id)).toEqual([w.identity]);
  });
});
