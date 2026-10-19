import { describe, expect, it } from 'vitest';
import { evaluate as evaluateAccess } from './support/accessEngine.js';
import { evaluate, orgEvents } from './support/stageB.js';
import { accessTrackingWorld, person, publishTrackingPolicy } from './support/stageBAccess.js';
import { at, createIdentity, detect } from './support/tracking.js';

/** Stage B (slice 8 task 3): tailgating at access points (default window 5 s). */

const tailgating = async (org: string) => (await orgEvents(org)).filter((e) => e.event_type === 'tailgating');
const bucket = (seconds: number, window = 5): number => Math.floor(Date.parse(at(seconds)) / 1000 / window);

describe('Stage B: tailgating', () => {
  it('should report two people at a face-credential door against one granted decision, once per bucket', async () => {
    const w = await accessTrackingWorld();
    const emp = await person(w.a, { profile_type: 'employee' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.entranceDoor.id });
    await evaluate((await detect(w.orgA.id, w.entranceCam, emp.identity, 0)).id);
    expect(await tailgating(w.orgA.id)).toEqual([]);
    const follower = await detect(w.orgA.id, w.entranceCam, w.identity, 2);
    await evaluate(follower.id);
    // A third person in the same bucket adds no event.
    await evaluate((await detect(w.orgA.id, w.entranceCam, await createIdentity(w.a), 3)).id);
    const events = await tailgating(w.orgA.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      identity_id: w.identity,
      detection_id: follower.id,
      access_point_id: w.entranceDoor.id,
      facility_id: w.facility.id,
      severity: 'high',
      dedup_key: `ap:${w.entranceDoor.id}:tailgating:${bucket(2)}`,
      payload: expect.objectContaining({ people: 2, granted: 1, window_seconds: 5 }),
    });
  });

  it('should not report people who were each granted, a single person or people outside the window', async () => {
    const w = await accessTrackingWorld();
    const a = await person(w.a, { profile_type: 'employee' });
    const b = await person(w.a, { profile_type: 'employee' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.entranceDoor.id });
    await evaluate((await detect(w.orgA.id, w.entranceCam, a.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.entranceCam, b.identity, 1)).id);
    // An unknown face long after the others.
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 30)).id);
    expect(await tailgating(w.orgA.id)).toEqual([]);
  });

  it('should have no signal at a door without face credential and without decisions', async () => {
    const w = await accessTrackingWorld();
    await evaluate((await detect(w.orgA.id, w.exitCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.exitCam, await createIdentity(w.a), 1)).id);
    expect(await tailgating(w.orgA.id)).toEqual([]);
  });

  it('should count terminal decisions at a door without face credential against the people its camera sees', async () => {
    const w = await accessTrackingWorld();
    const emp = await person(w.a, { profile_type: 'employee' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.exitDoor.id });
    // The employee badges in at the terminal (recorded decision), two faces pass the door camera.
    const badge = await evaluateAccess(w.orgA.id, w.exitDoor.id, { profile: emp.profile, at: at(0), record: true });
    expect(badge.result).toBe('granted');
    await evaluate((await detect(w.orgA.id, w.exitCam, emp.identity, 1)).id);
    await evaluate((await detect(w.orgA.id, w.exitCam, w.identity, 2)).id);
    const events = await tailgating(w.orgA.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      access_point_id: w.exitDoor.id,
      payload: expect.objectContaining({ people: 2, granted: 1 }),
    });
  });

  it('should not report two denied faces (no door opened for anyone)', async () => {
    const w = await accessTrackingWorld();
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.entranceCam, await createIdentity(w.a), 1)).id);
    expect(await tailgating(w.orgA.id)).toEqual([]);
  });

  it('should report one event for detections straddling a bucket boundary, whatever the evaluation order', async () => {
    const w = await accessTrackingWorld();
    const emp = await person(w.a, { profile_type: 'employee' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.entranceDoor.id });
    // B (unknown, bucket 1) is evaluated before A (granted, bucket 0); then both are redelivered.
    const b = await detect(w.orgA.id, w.entranceCam, w.identity, 6);
    await evaluate(b.id);
    const a = await detect(w.orgA.id, w.entranceCam, emp.identity, 4);
    await evaluate(a.id);
    await evaluate(a.id);
    await evaluate(b.id);
    expect(await tailgating(w.orgA.id)).toHaveLength(1);
  });

  it('should report one event for concurrent detections at a door without face credential', async () => {
    const w = await accessTrackingWorld();
    const emp = await person(w.a, { profile_type: 'employee' });
    await publishTrackingPolicy(w, { profile_type: 'employee' }, { access_point_id: w.exitDoor.id });
    await evaluateAccess(w.orgA.id, w.exitDoor.id, { profile: emp.profile, at: at(3), record: true });
    const people = [emp.identity, w.identity, await createIdentity(w.a), await createIdentity(w.a)];
    const detections = [];
    for (const [i, id] of people.entries()) detections.push(await detect(w.orgA.id, w.exitCam, id, 3 + i));
    await Promise.all([...detections, ...detections].map((d) => evaluate(d.id)));
    expect(await tailgating(w.orgA.id)).toHaveLength(1);
  });
});
