import { describe, expect, it } from 'vitest';
import { runSqlRows } from './support/sql.js';
import {
  areaOccupancies,
  at,
  createIdentity,
  createTrackingWorld,
  detect,
  facilityOccupancy,
  locations,
  occupancy,
  sessions,
} from './support/tracking.js';

describe('Stage A: locations and occupancy', () => {
  it('should write a location only on area or access point change and move the occupancy row', async () => {
    const w = await createTrackingWorld();
    const d0 = await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    await detect(w.orgA.id, w.entranceCam, w.identity, 1);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 5);
    const d3 = await detect(w.orgA.id, w.floorCam, w.identity, 40);
    await detect(w.orgA.id, w.floorCam, w.identity, 41);
    const [session] = await sessions(w.identity);
    const rows = await locations(w.identity);
    expect(rows.map((r) => [r.detection_id, r.area_id, r.access_point_id, r.movement_type])).toEqual([
      [d0.id, w.lobby.id, w.entranceDoor.id, 'entry'],
      [d3.id, w.zone.id, null, 'movement'],
    ]);
    expect(rows.every((r) => r.session_id === session.id)).toBe(true);
    expect(session).toMatchObject({ last_area_id: w.zone.id, last_access_point_id: null, areas_visited: [w.lobby.id, w.zone.id] });
    const occ = await occupancy(w.identity);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ area_id: w.zone.id, session_id: session.id });
    expect([Date.parse(occ[0].entered_at), Date.parse(occ[0].last_seen_at)]).toEqual([Date.parse(at(40)), Date.parse(at(41))]);
  });

  it('should count occupancy over the area subtree and the facility', async () => {
    const w = await createTrackingWorld();
    const second = await createIdentity(w.a);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.floorCam, second, 0);
    expect(await areaOccupancies(w.facility.id)).toEqual({ Building: 2, Lobby: 1, 'Floor 1': 1, 'Zone A': 1 });
    expect(await facilityOccupancy(w.facility.id)).toBe(2);
    await detect(w.orgA.id, w.floorCam, w.identity, 30);
    expect(await areaOccupancies(w.facility.id)).toEqual({ Building: 2, Lobby: 0, 'Floor 1': 2, 'Zone A': 2 });
  });

  it('should mark an exit-direction door as exit and return to the area after it as movement', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.exitCam, w.identity, 10);
    await detect(w.orgA.id, w.exitCam, w.identity, 11);
    expect((await locations(w.identity)).map((r) => r.movement_type)).toEqual(['entry', 'exit']);
  });

  it('should replace the occupancy row when a timed-out session is replaced by a new one', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.floorCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 1000);
    const [old, current] = await sessions(w.identity);
    const occ = await occupancy(w.identity);
    expect(occ).toEqual([expect.objectContaining({ area_id: w.lobby.id, session_id: current.id })]);
    const firstLocation = (await locations(w.identity)).find((r) => r.session_id === current.id);
    expect(firstLocation?.movement_type).toBe('entry');
    expect(old.status).toBe('lost');
  });
});

describe('Stage A: late detections (Review Focus 2)', () => {
  it('should not change session, location or occupancy for a detection older than last_detected_at', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.floorCam, w.identity, 100);
    const before = { s: await sessions(w.identity), l: await locations(w.identity), o: await occupancy(w.identity) };
    const late = await detect(w.orgA.id, w.exitCam, w.identity, 50);
    expect(await sessions(w.identity)).toEqual(before.s);
    expect(await locations(w.identity)).toEqual(before.l);
    expect(await occupancy(w.identity)).toEqual(before.o);
    const rows = await runSqlRows(`SELECT count(*) AS n FROM itap.identity_locations WHERE detection_id = '${late.id}'`);
    expect(rows[0].n).toBe('0');
  });

  it('should not reopen a closed session or close the active one for a late detection across a timeout gap', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    await detect(w.orgA.id, w.floorCam, w.identity, 1000);
    const before = await sessions(w.identity);
    expect(before.map((s) => s.status)).toEqual(['lost', 'active']);
    await detect(w.orgA.id, w.entranceCam, w.identity, 50);
    await detect(w.orgA.id, w.entranceCam, w.identity, 600);
    expect(await sessions(w.identity)).toEqual(before);
  });

  it('should not open a session for a late detection older than the last closed session', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    // Close the session as the stale-session cron would (no active session left).
    await runSqlRows(
      `UPDATE itap.tracking_sessions SET status = 'lost', ended_at = last_detected_at WHERE identity_id = '${w.identity}'`,
    );
    await runSqlRows(`DELETE FROM itap.area_occupancy WHERE identity_id = '${w.identity}'`);
    await detect(w.orgA.id, w.floorCam, w.identity, 60);
    expect((await sessions(w.identity)).map((s) => s.status)).toEqual(['lost']);
    expect(await occupancy(w.identity)).toEqual([]);
    await detect(w.orgA.id, w.floorCam, w.identity, 2000);
    expect((await sessions(w.identity)).map((s) => s.status)).toEqual(['lost', 'active']);
  });
});
