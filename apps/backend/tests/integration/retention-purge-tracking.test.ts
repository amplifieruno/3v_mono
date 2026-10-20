import { describe, expect, it } from 'vitest';
import { sqlHold } from './support/compliance.js';
import { runSqlRows } from './support/sql.js';
import {
  ago,
  camera,
  count,
  fileRow,
  insertRow,
  purge,
  purgeAll,
  q,
  queued,
  retentionWorld,
  sqlEvent,
  sqlIdentity,
  sqlPolicy,
  sqlProfile,
} from './support/retention.js';

/** Retention classes detections, locations, sessions, events (+ facility precedence and holds). */

const detection = (org: string, device: string, identity: string | null, days: number, extra: Record<string, string> = {}) =>
  insertRow('detections', {
    organization_id: q(org),
    device_id: q(device),
    identity_id: identity ? q(identity) : 'null',
    detected_at: ago(days),
    bbox: `'{"x":1,"y":2,"width":3,"height":4}'::jsonb`,
    similarity: '0.8',
    ...extra,
  });

const location = (org: string, facility: string, identity: string, days: number) =>
  insertRow('identity_locations', {
    organization_id: q(org),
    facility_id: q(facility),
    identity_id: q(identity),
    movement_type: q('entry'),
    occurred_at: ago(days),
  });

const closedSession = (org: string, facility: string, identity: string | null, days: number, profile: string | null = null) =>
  insertRow('tracking_sessions', {
    organization_id: q(org),
    facility_id: q(facility),
    identity_id: identity ? q(identity) : 'null',
    profile_id: profile ? q(profile) : 'null',
    status: q('completed'),
    started_at: ago(days + 1),
    last_detected_at: ago(days),
    ended_at: ago(days),
  });

describe('retention: detections', () => {
  it('should delete old detections except held ones and queue their thumbnails', async () => {
    const w = await retentionWorld();
    const device = await camera(w.a, w.facility.id);
    const free = await sqlIdentity(w.org);
    const held = await sqlIdentity(w.org);
    await sqlHold(w.org, { identity_id: held });
    const thumb = await fileRow(w.org, 'detection');
    const old = await detection(w.org, device, free, 40, { thumbnail_file_id: q(thumb) });
    const keptHeld = await detection(w.org, device, held, 40);
    const recent = await detection(w.org, device, free, 5);

    const r = await purgeAll('detections', w.org, ago(30));
    expect(r).toEqual({ affected: 1, skipped_by_hold: 1, files_enqueued: 1 });
    expect(await count(`itap.detections where id = '${old}'`)).toBe(0);
    expect(await count(`itap.detections where id in ('${keptHeld}', '${recent}')`)).toBe(2);
    expect(await queued(thumb)).toBe(true);
  });

  it('should anonymize detections (no identity, box, similarity, thumbnail) and then find nothing more to do', async () => {
    const w = await retentionWorld();
    const device = await camera(w.a, w.facility.id);
    const identity = await sqlIdentity(w.org);
    const id = await detection(w.org, device, identity, 40);
    expect(await purge('detections', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 1 });
    const [d] = await runSqlRows(`select identity_id, bbox, similarity, facility_id from itap.detections where id = '${id}'`);
    expect(d).toEqual({ identity_id: 'NULL', bbox: 'NULL', similarity: 'NULL', facility_id: w.facility.id });
    expect(await purge('detections', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 0 });
    await expect(purge('detections', w.org, ago(30), { action: 'archive' })).rejects.toThrow(/retention_action_invalid/);
  });
});

describe('retention: facility precedence (locations)', () => {
  it('should leave rows of a facility with its own policy to that policy, and org-wide rows without facility to the org policy', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    const inOwn = await location(w.org, w.facility.id, identity, 40);
    const inOther = await location(w.org, w.other.id, identity, 40);
    await sqlPolicy(w.org, 'locations', 30);
    await sqlPolicy(w.org, 'locations', 60, 'delete', w.facility.id);

    // Org-wide call: the facility with its own (longer) policy is excluded.
    expect(await purgeAll('locations', w.org, ago(30))).toMatchObject({ affected: 1 });
    expect(await count(`itap.identity_locations where id = '${inOther}'`)).toBe(0);
    expect(await count(`itap.identity_locations where id = '${inOwn}'`)).toBe(1);
    // Facility call with its own cutoff.
    expect(await purgeAll('locations', w.org, ago(60), { facility: w.facility.id })).toMatchObject({ affected: 0 });
    expect(await purgeAll('locations', w.org, ago(30), { facility: w.facility.id })).toMatchObject({ affected: 1 });
    // A facility-held row is skipped.
    const heldRow = await location(w.org, w.other.id, identity, 40);
    await sqlHold(w.org, { facility_id: w.other.id });
    expect(await purgeAll('locations', w.org, ago(30))).toMatchObject({ affected: 0, skipped_by_hold: 1 });
    expect(await count(`itap.identity_locations where id = '${heldRow}'`)).toBe(1);
    await expect(purge('audit', w.org, ago(400), { facility: w.facility.id })).rejects.toThrow(/retention_facility_invalid/);
  });
});

describe('retention: sessions', () => {
  it('should delete closed sessions only (locations keep their row) and anonymize them', async () => {
    const w = await retentionWorld();
    const identity = await sqlIdentity(w.org);
    const profile = await sqlProfile(w.org);
    const gone = await closedSession(w.org, w.facility.id, identity, 40);
    const loc = await insertRow('identity_locations', {
      organization_id: q(w.org),
      facility_id: q(w.facility.id),
      identity_id: q(identity),
      session_id: q(gone),
      movement_type: q('entry'),
      occurred_at: ago(40),
    });
    const active = await insertRow('tracking_sessions', {
      organization_id: q(w.org),
      facility_id: q(w.facility.id),
      identity_id: q(identity),
      status: q('active'),
      started_at: ago(50),
      last_detected_at: ago(45),
    });
    expect(await purgeAll('sessions', w.org, ago(30))).toMatchObject({ affected: 1 });
    expect(await count(`itap.tracking_sessions where id = '${gone}'`)).toBe(0);
    expect(await count(`itap.tracking_sessions where id = '${active}'`)).toBe(1);
    const [l] = await runSqlRows(`select session_id from itap.identity_locations where id = '${loc}'`);
    expect(l.session_id).toBe('NULL');

    const anon = await closedSession(w.org, w.facility.id, identity, 40, profile);
    expect(await purgeAll('sessions', w.org, ago(30), { action: 'anonymize' })).toMatchObject({ affected: 1 });
    const [s] = await runSqlRows(`select identity_id, profile_id, status from itap.tracking_sessions where id = '${anon}'`);
    expect(s).toEqual({ identity_id: 'NULL', profile_id: 'NULL', status: 'completed' });
  });
});

describe('retention: events', () => {
  it('should delete old events but keep those of open incidents and those of held incidents (counted as held)', async () => {
    const w = await retentionWorld();
    const plain = await sqlEvent(w.org, 40);
    const ofOpen = await sqlEvent(w.org, 40);
    const ofHeld = await sqlEvent(w.org, 40);
    const recent = await sqlEvent(w.org, 2);
    const open = await insertRow('incidents', { organization_id: q(w.org), title: q('Open') });
    const heldIncident = await insertRow('incidents', { organization_id: q(w.org), title: q('Held') });
    await insertRow('incident_events', { organization_id: q(w.org), incident_id: q(open), event_id: q(ofOpen) });
    await insertRow('incident_events', { organization_id: q(w.org), incident_id: q(heldIncident), event_id: q(ofHeld) });
    await sqlHold(w.org, { incident_id: heldIncident });

    expect(await purgeAll('events', w.org, ago(30))).toMatchObject({ affected: 1, skipped_by_hold: 1 });
    expect(await count(`itap.events where id = '${plain}'`)).toBe(0);
    expect(await count(`itap.events where id in ('${ofOpen}', '${ofHeld}', '${recent}')`)).toBe(3);
  });

  it('should anonymize events (person, log links and personal payload keys) and scope a subject call to that person', async () => {
    const w = await retentionWorld();
    const profile = await sqlProfile(w.org);
    const identity = await sqlIdentity(w.org, { profile_id: q(profile) });
    const stranger = await sqlIdentity(w.org);
    const mine = await sqlEvent(w.org, 40, {
      identity_id: q(identity),
      profile_id: q(profile),
      payload: `'{"matched_identity_id":"x","confidence":0.9,"reason":"policy_allow"}'::jsonb`,
    });
    const theirs = await sqlEvent(w.org, 40, { identity_id: q(stranger) });
    const r = await purgeAll('events', w.org, 'now()', { action: 'anonymize', subjectProfile: profile });
    expect(r.affected).toBe(1);
    const [e] = await runSqlRows(`select identity_id, profile_id, payload::text as payload from itap.events where id = '${mine}'`);
    expect(e.identity_id).toBe('NULL');
    expect(e.profile_id).toBe('NULL');
    expect(JSON.parse(String(e.payload))).toEqual({ reason: 'policy_allow', anonymized: true });
    const [t] = await runSqlRows(`select identity_id from itap.events where id = '${theirs}'`);
    expect(t.identity_id).toBe(stranger);
  });
});
