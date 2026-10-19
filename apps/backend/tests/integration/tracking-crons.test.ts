import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { expectDenied } from './support/fixtures.js';
import { updateByPk } from './support/operations.js';
import { closeStale, evaluateDwell, orgEvents, orgIncidents, publishedRule, types } from './support/stageB.js';
import { at, createIdentity, createTrackingWorld, detect, occupancy, sessions } from './support/tracking.js';

describe('close_stale_sessions', () => {
  it('should close only sessions idle longer than the timeout, with the Stage A rule, and clear occupancy', async () => {
    const w = await createTrackingWorld();
    const door = await createIdentity(w.a);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.entranceCam, door, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 100);
    // Cutoff = at - timeout (300 s) - 60 s grace: idle 350 s is past the timeout but inside the grace.
    expect(await closeStale(w.orgA.id, 350)).toEqual([]);
    expect(await closeStale(w.orgA.id, 361)).toEqual([{ id: (await sessions(door))[0].id, status: 'completed' }]);
    expect(await closeStale(w.orgA.id, 459)).toEqual([]);
    const closed = await closeStale(w.orgA.id, 461);
    expect(closed).toEqual([{ id: (await sessions(w.identity))[0].id, status: 'lost' }]);
    const [session] = await sessions(w.identity);
    expect(Date.parse(session.ended_at ?? '')).toBe(Date.parse(at(100)));
    expect(await occupancy(w.identity)).toEqual([]);
    expect(await closeStale(w.orgA.id, 1000)).toEqual([]);
    // A detection after the cron opens a new session.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 1001);
    expect((await sessions(w.identity)).map((s) => s.status)).toEqual(['lost', 'active']);
  });

  it('should leave a consistent state when it races a detection of the same identity', async () => {
    const w = await createTrackingWorld();
    const people = [w.identity, ...(await Promise.all([1, 2, 3, 4, 5].map(() => createIdentity(w.a))))];
    for (const id of people) await detect(w.orgA.id, w.lobbyCam, id, 0);
    // Cutoff 100 (460 - 300 s timeout - 60 s grace): the sessions (last seen at 0) are stale; the racing detection at
    // 250 extends one within the timeout or, if the cron closed it first, opens a new session.
    await Promise.all([
      closeStale(w.orgA.id, 460),
      ...people.map((id) => detect(w.orgA.id, w.lobbyCam, id, 250)),
    ]);
    for (const id of people) {
      const rows = await sessions(id);
      const active = rows.filter((r) => r.status === 'active');
      expect(active).toHaveLength(1);
      expect(Date.parse(active[0].last_detected_at)).toBe(Date.parse(at(250)));
      for (const closed of rows.filter((r) => r.status !== 'active')) {
        expect(closed.status).toBe('lost');
        expect(Date.parse(closed.last_detected_at)).toBe(Date.parse(at(0)));
        expect(Date.parse(closed.ended_at ?? '')).toBe(Date.parse(at(0)));
      }
      expect(await occupancy(id)).toEqual([expect.objectContaining({ session_id: active[0].id, area_id: w.lobby.id })]);
    }
  });

  it('should touch only the given organization and use its timeout', async () => {
    const w = await createTrackingWorld();
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    expect(await closeStale(w.orgB.id, 10_000)).toEqual([]);
    expect((await sessions(w.identity))[0].status).toBe('active');
  });

  it('should be callable with the admin secret only', async () => {
    const w = await createTrackingWorld();
    await expectDenied(
      w.a.request(`mutation { close_stale_sessions(args: {p_organization: "${w.orgA.id}", p_at: "${at(0)}"}) { id } }`),
      'close_stale_sessions',
    );
    await expectDenied(
      w.a.request(`mutation { evaluate_dwell_rules(args: {p_organization: "${w.orgA.id}", p_at: "${at(0)}"}) { id } }`),
      'evaluate_dwell_rules',
    );
  });
});

describe('evaluate_dwell_rules', () => {
  it('should emit loitering once per occupancy stint past the area threshold, dated at the crossing', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.lobby.id, { loitering_threshold_seconds: 60 });
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 30);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 65);
    expect(await evaluateDwell(w.orgA.id, 59)).toEqual([]);
    const [loitering] = await evaluateDwell(w.orgA.id, 90);
    expect(loitering).toMatchObject({ event_type: 'loitering', severity: 'low', area_id: w.lobby.id, identity_id: w.identity });
    expect(Date.parse(loitering.occurred_at)).toBe(Date.parse(at(60)));
    expect(loitering.dedup_key).toMatch(new RegExp(`^occupancy:[0-9a-f-]+:loitering:${w.lobby.id}:\\d+$`));
    expect(await evaluateDwell(w.orgA.id, 150)).toEqual([]);
    // A zone without a threshold never loiters; re-entering the lobby starts a new stint.
    await detect(w.orgA.id, w.floorCam, w.identity, 160);
    expect(await evaluateDwell(w.orgA.id, 600)).toEqual([]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 200);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 265);
    expect(types(await evaluateDwell(w.orgA.id, 270))).toEqual(['loitering']);
  });

  it('should not count dwell time after the person was last seen (left before the threshold)', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.lobby.id, { loitering_threshold_seconds: 60 });
    await publishedRule(w.a, 'unusual_dwell', { parameters: { dwell_seconds: 60 } }, [{ area_id: w.lobby.id }]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 50);
    // The occupancy row lives until the session times out, but the stay was observed for 50 s only.
    expect(await evaluateDwell(w.orgA.id, 90)).toEqual([]);
    expect(await evaluateDwell(w.orgA.id, 290)).toEqual([]);
  });

  it('should emit unusual_dwell per published rule threshold with its severity and incident', async () => {
    const w = await createTrackingWorld();
    const rule = await publishedRule(w.a, 'unusual_dwell', {
      severity: 'high',
      creates_incident: true,
      parameters: { dwell_seconds: 120 },
    }, [{ area_id: w.lobby.id }]);
    await publishedRule(w.a, 'unusual_dwell', { parameters: { dwell_seconds: 60 } }, [{ area_id: w.zone.id }]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    expect(await evaluateDwell(w.orgA.id, 100)).toEqual([]);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 125);
    const events = await evaluateDwell(w.orgA.id, 130);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event_type: 'unusual_dwell', severity: 'high', rule_version_id: rule.version });
    expect(Date.parse(events[0].occurred_at)).toBe(Date.parse(at(120)));
    expect(await evaluateDwell(w.orgA.id, 200)).toEqual([]);
    const incidents = await orgIncidents(w.orgA.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].incident_identities).toEqual([{ identity_id: w.identity, role: 'subject' }]);
    expect(types(await orgEvents(w.orgA.id))).toEqual(['unusual_dwell']);
  });

  it('should ignore occupancy of other organizations', async () => {
    const w = await createTrackingWorld();
    await updateByPk(w.a, 'areas', w.lobby.id, { loitering_threshold_seconds: 60 });
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    expect(await evaluateDwell(w.orgB.id, 1000)).toEqual([]);
    const { events } = await asAdmin().request<{ events: unknown[] }>(
      `query($o: uuid!) { events(where: {organization_id: {_eq: $o}}) { id } }`,
      { o: w.orgB.id },
    );
    expect(events).toEqual([]);
  });
});
