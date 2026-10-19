import { describe, expect, it } from 'vitest';
import { runSqlRows } from './support/sql.js';
import { evaluate, orgEvents } from './support/stageB.js';
import {
  accessTrackingWorld,
  orgDecisions,
  person,
  publishTrackingPolicy,
  setSetting,
  trackingGrant,
} from './support/stageBAccess.js';
import { at, createIdentity, detect } from './support/tracking.js';

/** Stage B (slice 8 task 3): face-as-credential decisions at camera-bound access points. */

const accessEvents = async (org: string) =>
  (await orgEvents(org)).filter((e) => e.event_type === 'access_granted' || e.event_type === 'access_denied');

describe('Stage B: face as credential', () => {
  it('should grant a face allowed by a policy at a face-credential door and emit access_granted for the detection', async () => {
    const w = await accessTrackingWorld();
    const emp = await person(w.a, { profile_type: 'employee' });
    const version = await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.entranceDoor.id });
    const d = await detect(w.orgA.id, w.entranceCam, emp.identity, 0);
    const events = await evaluate(d.id);
    const [decision] = await orgDecisions(w.orgA.id);
    expect(decision).toMatchObject({
      result: 'granted',
      reason: 'policy_allow',
      detection_id: d.id,
      identity_id: emp.identity,
      profile_id: emp.profile,
      device_id: w.entranceCam.id,
      access_point_id: w.entranceDoor.id,
      decided_at: at(0),
    });
    const granted = events.find((e) => e.event_type === 'access_granted');
    expect(granted).toMatchObject({
      detection_id: d.id,
      access_point_id: w.entranceDoor.id,
      dedup_key: `decision:${decision.id}`,
      occurred_at: expect.stringContaining('2026-01-05T08:00:00'),
      payload: expect.objectContaining({ reason: 'policy_allow', policy_version_id: version }),
    });
    // The session events of the same detection are still there.
    expect(events.map((e) => e.event_type)).toContain('detection_known');
  });

  it('should deny an unknown face and a known face without a rule, with access_denied events', async () => {
    const w = await accessTrackingWorld();
    const visitor = await person(w.a, { profile_type: 'visitor' });
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.entranceCam, visitor.identity, 1)).id);
    const decisions = await orgDecisions(w.orgA.id);
    expect(decisions.map((d) => [d.identity_id, d.result, d.reason])).toEqual([
      [w.identity, 'denied', 'unknown_person'],
      [visitor.identity, 'denied', 'no_rule'],
    ]);
    const events = await accessEvents(w.orgA.id);
    expect(events.map((e) => e.event_type)).toEqual(['access_denied', 'access_denied']);
  });

  it('should decide nothing at a door without the flag or for a detection outside any door', async () => {
    const w = await accessTrackingWorld();
    await evaluate((await detect(w.orgA.id, w.exitCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 30)).id);
    expect(await orgDecisions(w.orgA.id)).toEqual([]);
    expect(await accessEvents(w.orgA.id)).toEqual([]);
  });

  it('should decide at most once per person and door within the cooldown, per person', async () => {
    const w = await accessTrackingWorld();
    const other = await createIdentity(w.a);
    for (const s of [0, 4, 9]) await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, s)).id);
    await evaluate((await detect(w.orgA.id, w.entranceCam, other, 5)).id);
    // Default cooldown 10 s: the next decision for the first person needs more than 10 s since its last decision.
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 11)).id);
    await setSetting(w.orgA.id, 'face_credential_cooldown_seconds', 60);
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 40)).id);
    const decisions = await orgDecisions(w.orgA.id);
    expect(decisions.map((d) => [d.identity_id, d.decided_at])).toEqual([
      [w.identity, at(0)],
      [other, at(5)],
      [w.identity, at(11)],
    ]);
  });

  it('should be idempotent per detection: redelivery never records a second decision or consumes twice', async () => {
    const w = await accessTrackingWorld();
    const guest = await person(w.a, { profile_type: 'visitor' });
    const grant = await trackingGrant(w.a, guest.profile, { access_point_id: w.entranceDoor.id, single_use: true });
    const d = await detect(w.orgA.id, w.entranceCam, guest.identity, 0);
    // Redelivery racing the first delivery (and the event trigger's own call).
    await Promise.all([evaluate(d.id), evaluate(d.id), evaluate(d.id)]);
    await evaluate(d.id);
    const decisions = await orgDecisions(w.orgA.id);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ result: 'granted', reason: 'grant', grant_id: grant, detection_id: d.id });
    expect(await accessEvents(w.orgA.id)).toHaveLength(1);
    const [row] = await runSqlRows(`select used_at is not null as used from itap.access_grants where id = '${grant}'`);
    expect(row.used).toBe('t');
    // Outside the cooldown the consumed single-use grant no longer opens the door.
    await evaluate((await detect(w.orgA.id, w.entranceCam, guest.identity, 30)).id);
    expect((await orgDecisions(w.orgA.id)).map((x) => x.reason)).toEqual(['grant', 'no_rule']);
  });

  it('should refuse a second decision row for the same detection at the database level', async () => {
    const w = await accessTrackingWorld();
    const d = await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    await evaluate(d.id);
    await expect(
      runSqlRows(`insert into itap.access_decisions (organization_id, facility_id, access_point_id, result, reason, epoch,
        detection_id) values ('${w.orgA.id}', '${w.facility.id}', '${w.entranceDoor.id}', 'denied', 'no_rule', 0, '${d.id}')`),
    ).rejects.toThrow(/access_decisions_detection_id/);
  });
});
