import { describe, expect, it } from 'vitest';
import { createFacility } from './support/facilities.js';
import { insertOne, updateByPk } from './support/operations.js';
import { evaluate, knownPerson, orgEvents, orgIncidents, publishedRule, types } from './support/stageB.js';
import { createIdentity, createTrackingWorld, detect, sessions } from './support/tracking.js';

const of = (type: string) => (e: { event_type: string }) => e.event_type === type;

describe('Stage B: area-entered events', () => {
  it('should emit restricted_area_entry when the area rank is above the clearance rank, once per session and area', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'secure' });
    // Unknown identity: lowest clearance.
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    const entered = await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 5)).id);
    expect(types(entered)).toEqual(['restricted_area_entry']);
    const [session] = await sessions(w.identity);
    expect(entered[0]).toMatchObject({
      severity: 'high',
      area_id: w.zone.id,
      facility_id: w.facility.id,
      session_id: session.id,
      dedup_key: `session:${session.id}:restricted_area_entry:${w.zone.id}`,
      payload: expect.objectContaining({ area_access_level: 'secure', clearance: null }),
    });
    // Back to the lobby and into the zone again: same session and area, no new event.
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 10)).id);
    expect(await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 15)).id)).toEqual([]);
    expect((await orgEvents(w.orgA.id)).filter(of('restricted_area_entry'))).toHaveLength(1);
  });

  it('should compare clearance against the highest level on the area path', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.floor.id, { access_level: 'secure' });
    const elevated = await knownPerson(w.a, { access_level: 'elevated' });
    const standard = await knownPerson(w.a, { access_level: 'standard' });
    await evaluate((await detect(w.orgA.id, w.floorCam, elevated.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, standard.identity, 0)).id);
    const restricted = (await orgEvents(w.orgA.id)).filter(of('restricted_area_entry'));
    expect(restricted.map((e) => e.identity_id)).toEqual([standard.identity]);
    expect(restricted[0].payload).toMatchObject({ area_access_level: 'secure', clearance: 'standard' });
  });

  it('should emit occupancy_exceeded once per area and time bucket when the count passes capacity', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.lobby.id, { capacity: 1 });
    const second = await createIdentity(w.a);
    const third = await createIdentity(w.a);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    expect((await orgEvents(w.orgA.id)).filter(of('occupancy_exceeded'))).toEqual([]);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, second, 10)).id);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, third, 20)).id);
    const exceeded = (await orgEvents(w.orgA.id)).filter(of('occupancy_exceeded'));
    expect(exceeded).toHaveLength(1);
    expect(exceeded[0]).toMatchObject({
      area_id: w.lobby.id,
      identity_id: second,
      payload: expect.objectContaining({ capacity: 1, occupancy: 2 }),
    });
    expect(exceeded[0].dedup_key).toMatch(new RegExp(`^occupancy:${w.lobby.id}:occupancy_exceeded:\\d+$`));
  });
});

describe('Stage B: event rules in scope', () => {
  it('should apply only published, enabled rule versions whose facility or area scope matches', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'classified' });
    const elsewhere = await createFacility(w.a);
    await publishedRule(w.a, 'restricted_area', { severity: 'low' }, [{ facility_id: elsewhere.id }]);
    // A version scoped to a segment the identity is not a member of never matches.
    const segment = await insertOne(w.a, 'segments', { name: 'Nobody', kind: 'manual', target: 'identities' });
    await publishedRule(w.a, 'restricted_area', { severity: 'low' }, [{ segment_id: segment.id }]);
    const disabled = await publishedRule(w.a, 'restricted_area', { severity: 'critical' });
    await updateByPk(w.a, 'event_rules', disabled.rule, { is_enabled: false });
    // Area scope on an ancestor of the entered area matches; it sets severity and opens an incident.
    const match = await publishedRule(w.a, 'restricted_area', { severity: 'critical', creates_incident: true }, [
      { area_id: w.building.id },
    ]);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 0)).id);
    const event = (await orgEvents(w.orgA.id)).find(of('restricted_area_entry'));
    expect(event).toMatchObject({ severity: 'critical', rule_version_id: match.version });
    expect(event?.payload).toMatchObject({ rule_version_ids: [match.version] });
    const incidents = await orgIncidents(w.orgA.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0]).toMatchObject({ severity: 'critical', area_id: w.zone.id });
  });

  it('should keep one incident per session and rule and link further events of the session to it', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.zone.id, { access_level: 'secure' });
    await updateByPk(w.a, 'areas', w.lobby.id, { access_level: 'restricted' });
    await publishedRule(w.a, 'restricted_area', { creates_incident: true });
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 5)).id);
    const restricted = (await orgEvents(w.orgA.id)).filter(of('restricted_area_entry'));
    expect(restricted).toHaveLength(2);
    const incidents = await orgIncidents(w.orgA.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].incident_events.map((e) => e.event_id).sort()).toEqual(restricted.map((e) => e.id).sort());
  });

  it('should leave events without a rule at their default severity and without an incident', async () => {
    const w = await createTrackingWorld();
    await insertOne(w.a, 'watch_lists', { name: 'Empty', kind: 'watch' });
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    const [event] = await orgEvents(w.orgA.id);
    expect(event).toMatchObject({ event_type: 'detection_unknown', rule_version_id: null, severity: 'info' });
    expect(await orgIncidents(w.orgA.id)).toEqual([]);
  });

  it('should open one occupancy incident per area bucket and survive concurrent evaluation of many detections', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.lobby.id, { capacity: 1, access_level: 'restricted' });
    await updateByPk(w.a, 'areas', w.building.id, { capacity: 1 });
    await publishedRule(w.a, 'occupancy', { creates_incident: true });
    await publishedRule(w.a, 'restricted_area', { creates_incident: true });
    const people = [w.identity, ...(await Promise.all([1, 2, 3].map(() => createIdentity(w.a))))];
    const detections = [];
    for (const [i, id] of people.entries()) detections.push(await detect(w.orgA.id, w.lobbyCam, id, i));
    // Every detection evaluated twice, all at once (redelivery racing the first delivery).
    await Promise.all([...detections, ...detections].map((d) => evaluate(d.id)));
    const events = await orgEvents(w.orgA.id);
    expect(events.filter(of('occupancy_exceeded')).map((e) => e.area_id).sort()).toEqual([w.building.id, w.lobby.id].sort());
    expect(events.filter(of('restricted_area_entry'))).toHaveLength(4);
    const incidents = await orgIncidents(w.orgA.id);
    // One per person session for restricted_area; occupancy is about the area: one per area and bucket, even
    // though one person's session crossed both capacities.
    expect(incidents).toHaveLength(6);
    const occupancyIncidents = incidents.filter((i) => i.title.includes('Occupancy above capacity'));
    expect(occupancyIncidents.map((i) => i.area_id).sort()).toEqual([w.building.id, w.lobby.id].sort());
  });
});

