import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { expectDenied } from './support/fixtures.js';
import { insertOne, updateByPk } from './support/operations.js';
import { evaluate, knownPerson, listEntry, orgEvents, orgIncidents, publishedRule, types } from './support/stageB.js';
import { at, createIdentity, createTrackingWorld, detect, sessions } from './support/tracking.js';

describe('Stage B: session-opened events', () => {
  it('should emit one detection_known and one vip_arrival per session for 2 fps detections (Review Focus 1)', async () => {
    const w = await createTrackingWorld();
    const person = await knownPerson(w.a);
    const vip = await insertOne(w.a, 'watch_lists', { name: 'VIP', kind: 'vip', severity: 'low' });
    await listEntry(w.a, { watch_list_id: vip.id, profile_id: person.profile });
    const ids: string[] = [];
    // 30 s of 2 fps detections (same logic as 10 minutes: every row after the first extends the session).
    for (let i = 0; i < 60; i++) ids.push((await detect(w.orgA.id, w.lobbyCam, person.identity, i / 2)).id);
    for (const id of ids) await evaluate(id);
    const events = await orgEvents(w.orgA.id);
    expect(types(events)).toEqual(['detection_known', 'unexpected_facility', 'vip_arrival']);
    const [session] = await sessions(person.identity);
    const known = events.find((e) => e.event_type === 'detection_known');
    expect(known).toMatchObject({
      severity: 'info',
      session_id: session.id,
      detection_id: ids[0],
      identity_id: person.identity,
      profile_id: person.profile,
      facility_id: w.facility.id,
      area_id: w.lobby.id,
      device_id: w.lobbyCam.id,
      dedup_key: `session:${session.id}:detection_known`,
    });
    expect(events.find((e) => e.event_type === 'vip_arrival')).toMatchObject({
      severity: 'low',
      dedup_key: `session:${session.id}:vip_arrival:${vip.id}`,
      payload: expect.objectContaining({ watch_list_id: vip.id }),
    });
  });

  it('should emit detection_unknown for an identity without profile, again for a new session only', async () => {
    const w = await createTrackingWorld();
    const first = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    const opened = await evaluate(first.id);
    expect(types(opened)).toEqual(['detection_unknown']);
    expect(opened[0]).toMatchObject({ severity: 'info', profile_id: null });
    expect(await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 10)).id)).toEqual([]);
    const later = await detect(w.orgA.id, w.lobbyCam, w.identity, 10 + 301);
    expect(types(await evaluate(later.id))).toEqual(['detection_unknown']);
    expect(types(await orgEvents(w.orgA.id))).toEqual(['detection_unknown', 'detection_unknown']);
  });

  it('should not duplicate events or incidents when the same detection is evaluated again (Review Focus 3)', async () => {
    const w = await createTrackingWorld();
    const list = await insertOne(w.a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
    await listEntry(w.a, { watch_list_id: list.id, identity_id: w.identity });
    await publishedRule(w.a, 'watchlist', { creates_incident: true });
    const d = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    const [one, two] = await Promise.all([evaluate(d.id), evaluate(d.id)]);
    expect(types(one)).toEqual(types(two));
    await evaluate(d.id);
    expect(types(await orgEvents(w.orgA.id))).toEqual(['blacklist_match', 'detection_unknown']);
    expect(await orgIncidents(w.orgA.id)).toHaveLength(1);
  });

  it('should raise blacklist_match with the list severity, open an incident and flag the profile (Review Focus 5)', async () => {
    const w = await createTrackingWorld();
    const person = await knownPerson(w.a, { access_level: 'standard' });
    const list = await insertOne(w.a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
    await listEntry(w.a, { watch_list_id: list.id, profile_id: person.profile });
    const rule = await publishedRule(w.a, 'watchlist', { severity: 'medium', creates_incident: true }, [{ facility_id: w.facility.id }]);
    const ruleState = async () =>
      (
        await asAdmin().request<{ event_rules_by_pk: { trigger_count: number; last_triggered_at: string; updated_at: string } }>(
          `query($id: uuid!) { event_rules_by_pk(id: $id) { trigger_count last_triggered_at updated_at } }`,
          { id: rule.rule },
        )
      ).event_rules_by_pk;
    const before = await ruleState();
    const d = await detect(w.orgA.id, w.entranceCam, person.identity, 0);
    await evaluate(d.id);
    const match = (await orgEvents(w.orgA.id)).find((e) => e.event_type === 'blacklist_match');
    expect(match).toMatchObject({ severity: 'critical', rule_version_id: rule.version, access_point_id: w.entranceDoor.id });
    const [incident] = await orgIncidents(w.orgA.id);
    expect(incident).toMatchObject({ severity: 'critical', status: 'open', facility_id: w.facility.id, area_id: w.lobby.id });
    expect(incident.incident_events).toEqual([{ event_id: match?.id }]);
    expect(incident.incident_identities).toEqual([{ identity_id: person.identity, role: 'subject' }]);
    expect(incident.incident_activities.map((a) => a.kind)).toEqual(['status_change']);
    const profile = await asAdmin().request<{ profiles_by_pk: { is_blacklisted: boolean } }>(
      `query($id: uuid!) { profiles_by_pk(id: $id) { is_blacklisted } }`,
      { id: person.profile },
    );
    expect(profile.profiles_by_pk.is_blacklisted).toBe(true);
    const header = await ruleState();
    expect(header.trigger_count).toBe(1);
    expect(Date.parse(header.last_triggered_at)).toBe(Date.parse(d.detected_at));
    // Counters are not a configuration edit: updated_at stays.
    expect(header.updated_at).toBe(before.updated_at);
    // A new session is a new arrival: a new event and a new incident.
    await evaluate((await detect(w.orgA.id, w.entranceCam, person.identity, 1000)).id);
    expect(await orgIncidents(w.orgA.id)).toHaveLength(2);
  });

  it('should emit inactive_profile_detected and unexpected_facility only for the first session in a facility', async () => {
    const w = await createTrackingWorld();
    const person = await knownPerson(w.a, { status: 'suspended' });
    await evaluate((await detect(w.orgA.id, w.lobbyCam, person.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, person.identity, 1000)).id);
    expect(types(await orgEvents(w.orgA.id))).toEqual([
      'detection_known',
      'detection_known',
      'inactive_profile_detected',
      'inactive_profile_detected',
      'unexpected_facility',
    ]);
  });

  it('should emit after_hours outside operating hours in the facility timezone', async () => {
    const w = await createTrackingWorld();
    const hours = [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }];
    await updateByPk(w.a, 'facilities', w.facility.id, { operating_hours: hours });
    // at(0) is Monday 08:00 UTC: before opening in UTC.
    const early = await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    expect(types(early)).toEqual(['after_hours', 'detection_unknown']);
    expect(early.find((e) => e.event_type === 'after_hours')?.severity).toBe('medium');
    // 17:00 in Tokyo: inside the window.
    await updateByPk(w.a, 'facilities', w.facility.id, { timezone: 'Asia/Tokyo' });
    const other = await createIdentity(w.a);
    expect(types(await evaluate((await detect(w.orgA.id, w.lobbyCam, other, 5)).id))).toEqual(['detection_unknown']);
  });

  it('should match only watch-list entries created at or before the detection time', async () => {
    const w = await createTrackingWorld();
    const list = await insertOne(w.a, 'watch_lists', { name: 'Banned', kind: 'blacklist', severity: 'critical' });
    await listEntry(w.a, { watch_list_id: list.id, identity_id: w.identity }, at(100));
    // Session 1 opens at 0, before the entry existed: no match (history replayed later stays as it was).
    expect(types(await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id))).toEqual(['detection_unknown']);
    // Session 2 opens at 1000 (after the 300 s timeout), after the entry: blacklist_match.
    const later = await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 1000)).id);
    expect(types(later)).toEqual(['blacklist_match', 'detection_unknown']);
    // An entry created exactly at the detection time counts.
    const other = await createIdentity(w.a);
    await listEntry(w.a, { watch_list_id: list.id, identity_id: other }, at(2000));
    expect(types(await evaluate((await detect(w.orgA.id, w.lobbyCam, other, 2000)).id))).toContain('blacklist_match');
  });

  it('should emit nothing for late and extending detections (Review Focus 2)', async () => {
    const w = await createTrackingWorld();
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 100)).id);
    expect(await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 50)).id)).toEqual([]);
    expect(types(await orgEvents(w.orgA.id))).toEqual(['detection_unknown']);
  });

  it('should return nothing for an unknown detection and be callable with the admin secret only', async () => {
    const w = await createTrackingWorld();
    expect(await evaluate('00000000-0000-4000-8000-000000000000')).toEqual([]);
    const d = await detect(w.orgA.id, w.lobbyCam, null, 0);
    expect(await evaluate(d.id)).toEqual([]);
    await expectDenied(
      w.a.request(`mutation($d: uuid!) { evaluate_detection(args: {p_detection: $d}) { id } }`, { d: d.id }),
      'evaluate_detection',
    );
  });
});
