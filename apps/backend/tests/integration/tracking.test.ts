import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createDevice, createFacility } from './support/facilities.js';
import { expectDenied, expectError } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, bindCamera, createTrackingWorld, detect, identityCounters, sessions } from './support/tracking.js';

describe('detections', () => {
  it('should derive facility, area and the camera access point from the device', async () => {
    const w = await createTrackingWorld();
    const d = await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    expect(d).toMatchObject({ facility_id: w.facility.id, area_id: w.lobby.id, access_point_id: w.entranceDoor.id });
    const plain = await detect(w.orgA.id, w.lobbyCam, w.identity, 1);
    expect(plain).toMatchObject({ facility_id: w.facility.id, area_id: w.lobby.id, access_point_id: null });
    const explicit = await detect(w.orgA.id, w.lobbyCam, w.identity, 2, { area_id: w.zone.id });
    expect(explicit.area_id).toBe(w.zone.id);
  });

  it('should derive the access point only from a single camera binding of the device', async () => {
    const w = await createTrackingWorld();
    // The exit camera also watches the entrance door: two camera bindings, ambiguous.
    await bindCamera(w.a, w.facility.id, w.entranceDoor.id, w.exitCam.id);
    const ambiguous = await detect(w.orgA.id, w.exitCam, w.identity, 0);
    expect(ambiguous.access_point_id).toBeNull();
    const explicit = await detect(w.orgA.id, w.exitCam, w.identity, 1, { access_point_id: w.exitDoor.id });
    expect(explicit.access_point_id).toBe(w.exitDoor.id);
    // A device with one camera binding still derives it.
    expect((await detect(w.orgA.id, w.entranceCam, w.identity, 2)).access_point_id).toBe(w.entranceDoor.id);
  });

  it('should reject a facility that is not the device facility and a missing device', async () => {
    const w = await createTrackingWorld();
    const other = await createFacility(w.a);
    const err = await expectError(detect(w.orgA.id, w.lobbyCam, w.identity, 0, { facility_id: other.id }));
    expect(err.message).toContain('detection_facility_mismatch');
    const missing = await expectError(
      asAdmin().request(`mutation($o: detections_insert_input!) { insert_detections_one(object: $o) { id } }`, {
        o: { organization_id: w.orgA.id, detected_at: at(0) },
      }),
    );
    expect(missing.message).toContain('detection_device_required');
  });

  it('should be read-only for org_admin and invisible to other organizations', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    await expectDenied(
      w.a.request(`mutation($d: uuid!) { insert_detections_one(object: {device_id: $d, detected_at: "${at(1)}"}) { id } }`, {
        d: w.lobbyCam.id,
      }),
      'insert_detections_one',
    );
    await expectDenied(w.a.request(`mutation { delete_tracking_sessions(where: {}) { affected_rows } }`), 'delete_tracking_sessions');
    const own = await w.a.request<Record<string, unknown[]>>(
      `query { detections { id } tracking_sessions { id } identity_locations { id } area_occupancy { id } }`,
    );
    expect(own.detections).toHaveLength(1);
    expect(own.tracking_sessions).toHaveLength(1);
    expect(own.identity_locations).toHaveLength(1);
    expect(own.area_occupancy).toHaveLength(1);
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    const foreign = await b.request<Record<string, unknown[]>>(
      `query { detections { id } tracking_sessions { id } identity_locations { id } area_occupancy { id } }`,
    );
    expect(Object.values(foreign).flat()).toEqual([]);
  });
});

describe('Stage A: identity counters and sessions', () => {
  it('should throttle identity counters by detected_at and never move last_seen_at back', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    const first = await identityCounters(w.identity);
    expect(first.detection_count).toBe(1);
    expect([Date.parse(first.first_seen_at ?? ''), Date.parse(first.last_seen_at ?? '')]).toEqual([
      Date.parse(at(100)),
      Date.parse(at(100)),
    ]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 102);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 104);
    expect((await identityCounters(w.identity)).detection_count).toBe(1);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 111);
    const after = await identityCounters(w.identity);
    expect(after.detection_count).toBe(4);
    expect(Date.parse(after.last_seen_at ?? '')).toBe(Date.parse(at(111)));
    // A late detection: earlier than first_seen_at lowers it, last_seen_at stays.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 50);
    const late = await identityCounters(w.identity);
    expect(Date.parse(late.first_seen_at ?? '')).toBe(Date.parse(at(50)));
    expect(Date.parse(late.last_seen_at ?? '')).toBe(Date.parse(at(111)));
    expect(late.detection_count).toBe(5);
    const audit = await runSqlRows(
      `SELECT count(*) AS n FROM itap.audit_log WHERE entity_id = '${w.identity}' AND action <> 'insert'`,
    );
    expect(audit[0].n).toBe('0');
  });

  it('should add the detections since the last counter write instead of recounting all of them', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    expect((await identityCounters(w.identity)).detection_count).toBe(1);
    // Stand-in for a long history: a write must add to the stored count, never recount the identity's detections.
    await runSql(`UPDATE itap.identities SET detection_count = 1000 WHERE id = '${w.identity}'`);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 103);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 105);
    expect((await identityCounters(w.identity)).detection_count).toBe(1000);
    // Same detected_at as the last write: counted at once (a later range count could not tell it apart).
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    expect((await identityCounters(w.identity)).detection_count).toBe(1001);
    // Past the throttle window: adds 103, 105 and 120.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 120);
    expect((await identityCounters(w.identity)).detection_count).toBe(1004);
    // Late detections (inside or before the seen range) are counted at once.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 110);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 10);
    const late = await identityCounters(w.identity);
    expect(late.detection_count).toBe(1006);
    expect(Date.parse(late.first_seen_at ?? '')).toBe(Date.parse(at(10)));
    expect(Date.parse(late.last_seen_at ?? '')).toBe(Date.parse(at(120)));
  });

  it('should count exactly for a multi-row insert in detected_at order with equal timestamps', async () => {
    const w = await createTrackingWorld();
    const objects = [0, 0, 3, 12, 12].map((s) => ({
      organization_id: w.orgA.id, device_id: w.lobbyCam.id, identity_id: w.identity, detected_at: at(s), confidence: 0.9,
    }));
    await asAdmin().request(`mutation($o: [detections_insert_input!]!) { insert_detections(objects: $o) { affected_rows } }`, {
      o: objects,
    });
    const counters = await identityCounters(w.identity);
    expect(counters.detection_count).toBe(5);
    expect(Date.parse(counters.last_seen_at ?? '')).toBe(Date.parse(at(12)));
  });

  it('should open one session and extend it while detections keep coming within the timeout', async () => {
    const w = await createTrackingWorld();
    const first = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    for (const s of [60, 200, 450]) await detect(w.orgA.id, w.lobbyCam, w.identity, s);
    const rows = await sessions(w.identity);
    expect(rows).toHaveLength(1);
    expect(rows[0].opened_by_detection_id).toBe(first.id);
    expect(rows[0]).toMatchObject({ status: 'active', facility_id: w.facility.id, last_area_id: w.lobby.id, ended_at: null });
    expect(Date.parse(rows[0].started_at)).toBe(Date.parse(at(0)));
    expect(Date.parse(rows[0].last_detected_at)).toBe(Date.parse(at(450)));
    expect(rows[0].areas_visited).toEqual([w.lobby.id]);
  });

  it('should close a timed-out session as lost and open a new one', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.floorCam, w.identity, 30);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 30 + 301);
    const [old, current] = await sessions(w.identity);
    expect(old).toMatchObject({ status: 'lost', duration_seconds: 30 });
    expect(Date.parse(old.ended_at ?? '')).toBe(Date.parse(at(30)));
    expect(current).toMatchObject({ status: 'active', areas_visited: [w.lobby.id] });
    expect(Date.parse(current.started_at)).toBe(Date.parse(at(331)));
  });

  it('should close as completed when the last detection was at an entry/exit access point', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.entranceCam, w.identity, 20);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 20 + 600);
    const [old, current] = await sessions(w.identity);
    expect(old).toMatchObject({ status: 'completed', last_access_point_id: w.entranceDoor.id });
    expect(current.status).toBe('active');
  });

  it('should treat an exit-direction door that is not entry/exit as lost and use the per-org timeout', async () => {
    const w = await createTrackingWorld();
    await runSql(`UPDATE itap.organization_settings SET tracking_timeout_seconds = 60 WHERE organization_id = '${w.orgA.id}'`);
    await detect(w.orgA.id, w.exitCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 61);
    const [old] = await sessions(w.identity);
    expect(old.status).toBe('lost');
  });

  it('should keep sessions of one identity in two facilities independent (Review Focus 4)', async () => {
    const w = await createTrackingWorld();
    const second = await createFacility(w.a);
    const cam2 = await createDevice(w.a, second.id);
    for (const s of [0, 10, 20]) {
      await detect(w.orgA.id, w.lobbyCam, w.identity, s);
      await detect(w.orgA.id, cam2, w.identity, s);
    }
    await detect(w.orgA.id, cam2, w.identity, 20 + 400);
    const rows = await sessions(w.identity);
    const active = rows.filter((r) => r.status === 'active').map((r) => r.facility_id).sort();
    expect(active).toEqual([w.facility.id, second.id].sort());
    expect(rows.filter((r) => r.facility_id === w.facility.id)).toHaveLength(1);
    expect(rows.filter((r) => r.facility_id === second.id).map((r) => r.status)).toEqual(['lost', 'active']);
  });

  it('should not create a session for a detection without identity', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, null, 0);
    const rows = await runSqlRows(`SELECT count(*) AS n FROM itap.tracking_sessions WHERE organization_id = '${w.orgA.id}'`);
    expect(rows[0].n).toBe('0');
  });

  it('should never create two active sessions for concurrent detections of one identity in one facility', async () => {
    const w = await createTrackingWorld();
    await Promise.all(
      Array.from({ length: 16 }, (_, i) => detect(w.orgA.id, i % 2 ? w.lobbyCam : w.floorCam, w.identity, i)),
    );
    const rows = await sessions(w.identity);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('active');
  });
});
