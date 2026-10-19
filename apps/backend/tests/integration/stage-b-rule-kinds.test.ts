import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { expectError } from './support/fixtures.js';
import { insertOne } from './support/operations.js';
import { evaluate, knownPerson, listEntry, orgEvents, orgIncidents, publishedRule } from './support/stageB.js';
import { createTrackingWorld, detect } from './support/tracking.js';

describe('Stage B: watch-list rules by kind (parameters.watch_list_kinds)', () => {
  it('should apply a watchlist rule only to the watch-list kinds it names', async () => {
    const w = await createTrackingWorld();
    const blacklist = await insertOne(w.a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
    const vips = await insertOne(w.a, 'watch_lists', { name: 'VIP', kind: 'vip', severity: 'info' });
    const banned = await knownPerson(w.a);
    const guest = await knownPerson(w.a, { first_name: 'Vic', access_level: 'elevated' });
    await listEntry(w.a, { watch_list_id: blacklist.id, profile_id: banned.profile });
    await listEntry(w.a, { watch_list_id: vips.id, profile_id: guest.profile });
    const incidentRule = await publishedRule(w.a, 'watchlist', {
      creates_incident: true,
      parameters: { watch_list_kinds: ['blacklist', 'watch'] },
    });
    const vipRule = await publishedRule(w.a, 'watchlist', { severity: 'info', parameters: { watch_list_kinds: ['vip'] } });

    await evaluate((await detect(w.orgA.id, w.entranceCam, banned.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.entranceCam, guest.identity, 1)).id);
    const events = await orgEvents(w.orgA.id);
    const match = events.find((e) => e.event_type === 'blacklist_match');
    const arrival = events.find((e) => e.event_type === 'vip_arrival');
    expect(match).toMatchObject({ rule_version_id: incidentRule.version, severity: 'critical' });
    expect(match?.payload.rule_version_ids).toEqual([incidentRule.version]);
    expect(arrival).toMatchObject({ rule_version_id: vipRule.version, severity: 'info' });
    expect(arrival?.payload.rule_version_ids).toEqual([vipRule.version]);
    // Only the blacklist match opens an incident.
    const incidents = await orgIncidents(w.orgA.id);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].incident_events).toEqual([{ event_id: match?.id }]);
  });

  it('should keep a watchlist rule without watch_list_kinds applying to every kind', async () => {
    const w = await createTrackingWorld();
    const vips = await insertOne(w.a, 'watch_lists', { name: 'VIP', kind: 'vip', severity: 'info' });
    const guest = await knownPerson(w.a, { access_level: 'elevated' });
    await listEntry(w.a, { watch_list_id: vips.id, profile_id: guest.profile });
    const all = await publishedRule(w.a, 'watchlist', {});
    await evaluate((await detect(w.orgA.id, w.entranceCam, guest.identity, 0)).id);
    const arrival = (await orgEvents(w.orgA.id)).find((e) => e.event_type === 'vip_arrival');
    expect(arrival?.rule_version_id).toBe(all.version);
  });

  it('should reject watch_list_kinds that is not a non-empty array of watch-list kinds', async () => {
    const w = await createTrackingWorld();
    const rule = await insertOne(w.a, 'event_rules', { name: 'Kinds', rule_type: 'watchlist' });
    for (const kinds of [['friend'], [], 'vip']) {
      const err = await expectError(
        insertOne(w.a, 'event_rule_versions', { rule_id: rule.id, parameters: { watch_list_kinds: kinds } }),
      );
      expect(err.message + String((err as { detail?: string }).detail ?? '')).toMatch(/watch_list_kinds_valid|check/i);
    }
  });
});

describe('Stage B: incident time', () => {
  it('should open an incident at the time of its triggering event, with the creation activity at that time', async () => {
    const w = await createTrackingWorld();
    const blacklist = await insertOne(w.a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
    await listEntry(w.a, { watch_list_id: blacklist.id, identity_id: w.identity });
    await publishedRule(w.a, 'watchlist', { creates_incident: true });
    const d = await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    await evaluate(d.id);
    const data = await asAdmin().request<{
      incidents: { created_at: string; incident_activities: { kind: string; occurred_at: string }[] }[];
    }>(
      `query($o: uuid!) { incidents(where: {organization_id: {_eq: $o}}) {
        created_at incident_activities { kind occurred_at } } }`,
      { o: w.orgA.id },
    );
    const [incident] = data.incidents;
    expect(Date.parse(incident.created_at)).toBe(Date.parse(d.detected_at));
    expect(incident.incident_activities.map((a) => Date.parse(a.occurred_at))).toEqual([Date.parse(d.detected_at)]);
  });

  it('should not repeat the rule name when the event title already starts with it', async () => {
    const w = await createTrackingWorld();
    const list = await insertOne(w.a, 'watch_lists', { name: 'Blacklist', kind: 'blacklist', severity: 'critical' });
    const banned = await knownPerson(w.a);
    await listEntry(w.a, { watch_list_id: list.id, profile_id: banned.profile });
    await publishedRule(w.a, 'watchlist', { creates_incident: true }, [], 'Blacklist match');
    await publishedRule(w.a, 'watchlist', { creates_incident: true }, [], 'Front desk alert');
    await evaluate((await detect(w.orgA.id, w.entranceCam, banned.identity, 0)).id);
    const titles = (await orgIncidents(w.orgA.id)).map((i) => i.title).sort();
    expect(titles).toEqual(['Blacklist match: Blacklist', 'Front desk alert: Blacklist match: Blacklist']);
  });
});
