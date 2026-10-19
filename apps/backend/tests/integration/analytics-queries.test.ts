import { describe, expect, it } from 'vitest';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asOrgAdmin } from './support/clients.js';
import { expectError } from './support/fixtures.js';
import { notificationRule } from './support/notifications.js';
import { manualSegment, mergeInto } from './support/segments.js';
import { runSql } from './support/sql.js';
import { closeStale, evaluate } from './support/stageB.js';
import { HOUR, aggregateRange, dailyStats, setTrackingTimeout, statsWorld } from './support/analytics.js';
import { at, createIdentity, createTrackingWorld, detect } from './support/tracking.js';
import { createVisit, personOfType } from './support/visits.js';

async function query<T = Record<string, unknown>>(client: HasuraClient, fn: string, args: Record<string, unknown>, fields: string): Promise<T[]> {
  const data = Object.keys(args).length === 0
    ? await client.request<Record<string, T[]>>(`query { ${fn} { ${fields} } }`)
    : await client.request<Record<string, T[]>>(`query($a: ${fn}_args!) { ${fn}(args: $a) { ${fields} } }`, { a: args });
  return data[fn];
}

const SERIES = 'bucket_start day unique_identities entries exits dwell_seconds avg_dwell_seconds peak_occupancy';
const TIMELINE = 'kind identity_id occurred_at session_id area_id event_type detection_id visit_id';
type TimelineRow = { kind: string; identity_id: string; occurred_at: string; area_id: string | null; event_type: string | null };
const ms = (iso: string): number => Date.parse(iso);

describe('analytics query functions', () => {
  it('should read occupancy series, the flow matrix and current occupancy from the stats of the own organization', async () => {
    const w = await statsWorld();
    await aggregateRange(w.orgA.id, -HOUR, 4 * HOUR);
    const hours = await query<Record<string, unknown>>(w.a, 'occupancy_series',
      { p_facility: w.facility.id, p_from: at(-HOUR), p_to: at(3 * HOUR), p_bucket: 'hour' }, SERIES);
    expect(hours.map((r) => [ms(String(r.bucket_start)), r.day, r.unique_identities, r.entries, r.exits, r.peak_occupancy])).toEqual([
      [ms(at(-HOUR)), null, 1, 1, 0, 1],
      [ms(at(0)), null, 2, 1, 0, 2],
      [ms(at(HOUR)), null, 2, 0, 1, 2],
      [ms(at(2 * HOUR)), null, 1, 0, 0, 1],
    ]);
    // Day buckets (facility-local days); empty buckets are zero-filled.
    const days = await query<Record<string, unknown>>(w.a, 'occupancy_series',
      { p_facility: w.facility.id, p_from: at(-8 * HOUR), p_to: at(40 * HOUR), p_bucket: 'day' }, SERIES);
    expect(days).toEqual([
      { bucket_start: '2026-01-05T00:00:00+00:00', day: '2026-01-05', unique_identities: 2, entries: 2, exits: 1, dwell_seconds: 12600, avg_dwell_seconds: 6300, peak_occupancy: 2 },
      { bucket_start: '2026-01-06T00:00:00+00:00', day: '2026-01-06', unique_identities: 0, entries: 0, exits: 0, dwell_seconds: 0, avg_dwell_seconds: null, peak_occupancy: 0 },
    ]);
    await expect(query(w.a, 'occupancy_series', { p_facility: w.facility.id, p_from: at(0), p_to: at(HOUR), p_bucket: 'week' }, SERIES))
      .rejects.toThrow(/analytics_bucket_invalid/);
    expect((await expectError(query(w.a, 'occupancy_series', { p_facility: w.facility.id, p_from: at(HOUR), p_to: at(0), p_bucket: 'hour' }, SERIES)))
      .message).toContain('analytics_period_invalid');
    await expect(query(w.a, 'occupancy_series', { p_facility: w.facility.id, p_from: at(0), p_to: at(200 * 24 * HOUR), p_bucket: 'hour' }, SERIES))
      .rejects.toThrow(/analytics_period_too_long/);

    const flows = await query(w.a, 'flow_matrix', { p_facility: w.facility.id, p_from: at(0), p_to: at(HOUR) }, 'from_area_id to_area_id count');
    expect(flows).toEqual([
      { from_area_id: w.lobby.id, to_area_id: w.zone.id, count: 2 },
      { from_area_id: w.zone.id, to_area_id: w.lobby.id, count: 1 },
    ]);

    // P2 is still in Zone A (area_occupancy); parents roll up, the facility total has no area.
    const now = await query<{ area_id: string | null; occupancy: number; direct_occupancy: number }>(w.a, 'facility_occupancy_now',
      { p_facility: w.facility.id }, 'area_id occupancy direct_occupancy capacity name');
    const byArea = Object.fromEntries(now.map((r) => [r.area_id ?? 'facility', [r.occupancy, r.direct_occupancy]]));
    expect(byArea).toEqual({
      facility: [1, 1], [w.building.id]: [1, 0], [w.lobby.id]: [0, 0], [w.floor.id]: [1, 0], [w.zone.id]: [1, 1],
    });

    // Another organization's admin sees nothing of this facility.
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    expect(await query(b, 'occupancy_series', { p_facility: w.facility.id, p_from: at(0), p_to: at(HOUR), p_bucket: 'hour' }, SERIES)).toEqual([]);
    expect(await query(b, 'flow_matrix', { p_facility: w.facility.id, p_from: at(0), p_to: at(HOUR) }, 'count')).toEqual([]);
    expect(await query(b, 'facility_occupancy_now', { p_facility: w.facility.id }, 'occupancy')).toEqual([]);
  });

  it('should count current occupancy by effective identity after a merge', async () => {
    const w = await createTrackingWorld();
    const source = await createIdentity(w.a);
    const nowSeconds = Math.floor((Date.now() - ms(at(0))) / 1000) - 5;
    await detect(w.orgA.id, w.lobbyCam, w.identity, nowSeconds);
    await detect(w.orgA.id, w.floorCam, source, nowSeconds);
    const occupancy = async () => Object.fromEntries((await query<{ area_id: string | null; occupancy: number }>(w.a,
      'facility_occupancy_now', { p_facility: w.facility.id }, 'area_id occupancy')).map((r) => [r.area_id ?? 'facility', r.occupancy]));
    expect(await occupancy()).toMatchObject({ facility: 2, [w.building.id]: 2, [w.lobby.id]: 1, [w.zone.id]: 1 });
    // The merged source keeps its occupancy row until its session closes; both rows are one person now.
    await mergeInto(w.a, w.identity, [source]);
    expect(await occupancy()).toMatchObject({ facility: 1, [w.building.id]: 1, [w.lobby.id]: 1, [w.zone.id]: 1 });
    const [kpis] = await query<{ current_occupancy: number }>(w.a, 'dashboard_kpis', {}, 'current_occupancy');
    expect(kpis.current_occupancy).toBe(1);
  });

  it('should return the identity timeline including the history of identities merged into it', async () => {
    const w = await createTrackingWorld();
    await setTrackingTimeout(w.orgA.id, 7200);
    const source = await createIdentity(w.a);
    await evaluate((await detect(w.orgA.id, w.entranceCam, w.identity, 0)).id);
    await evaluate((await detect(w.orgA.id, w.floorCam, w.identity, 600)).id);
    await evaluate((await detect(w.orgA.id, w.lobbyCam, source, 3000)).id);
    await closeStale(w.orgA.id, 11000);
    await mergeInto(w.a, w.identity, [source]);
    const timeline = await query<TimelineRow>(w.a, 'identity_timeline', { p_identity: w.identity }, TIMELINE);
    expect(timeline.map((r) => [r.kind, r.identity_id, ms(r.occurred_at), r.area_id, r.event_type])).toEqual([
      ['session_ended', source, ms(at(3000)), w.lobby.id, null],
      ['event', source, ms(at(3000)), w.lobby.id, 'detection_unknown'],
      ['location', source, ms(at(3000)), w.lobby.id, null],
      ['session_started', source, ms(at(3000)), null, null],
      ['session_ended', w.identity, ms(at(600)), w.zone.id, null],
      ['location', w.identity, ms(at(600)), w.zone.id, null],
      ['event', w.identity, ms(at(0)), w.lobby.id, 'detection_unknown'],
      ['location', w.identity, ms(at(0)), w.lobby.id, null],
      ['session_started', w.identity, ms(at(0)), null, null],
    ]);
    // Period [from, to) and limit (clamped to 1..500).
    const window = await query<TimelineRow>(w.a, 'identity_timeline', { p_identity: w.identity, p_from: at(500), p_to: at(3000) }, TIMELINE);
    expect(window.map((r) => r.kind)).toEqual(['session_ended', 'location']);
    expect(await query(w.a, 'identity_timeline', { p_identity: w.identity, p_limit: 2 }, 'kind')).toHaveLength(2);
    expect(await query(w.a, 'identity_timeline', { p_identity: w.identity, p_limit: 0 }, 'kind')).toHaveLength(1);
    // The source alone shows only its own history; another organization sees nothing.
    expect((await query<TimelineRow>(w.a, 'identity_timeline', { p_identity: source }, TIMELINE)).map((r) => r.identity_id))
      .toEqual(Array(4).fill(source));
    expect(await query(asOrgAdmin(w.other.id, w.orgB.id), 'identity_timeline', { p_identity: w.identity }, 'kind')).toEqual([]);
  });

  it('should show visits in the timeline and count them as guest visits of the facility day', async () => {
    const w = await createTrackingWorld();
    const visitor = await personOfType(w.a, 'visitor');
    const visit = await createVisit(w.a, visitor.profile, -HOUR, 2 * HOUR, { facility_id: w.facility.id });
    await runSql(`SET LOCAL session_replication_role = replica;
      UPDATE itap.visits SET status = 'checked_in', checked_in_at = '${at(-300)}' WHERE id = '${visit.id}'`);
    await detect(w.orgA.id, w.lobbyCam, visitor.identity, 0);
    await aggregateRange(w.orgA.id, 0, HOUR);
    expect(await dailyStats(w.orgA.id)).toEqual([expect.objectContaining({ visits: '1', guest_visits: '1', known_identities: '1' })]);
    const timeline = await query<TimelineRow & { visit_id: string }>(w.a, 'identity_timeline', { p_identity: visitor.identity }, TIMELINE);
    expect(timeline.at(-1)).toMatchObject({ kind: 'visit_checked_in', visit_id: visit.id });
    expect(ms(timeline.at(-1)?.occurred_at ?? '')).toBe(ms(at(-300)));
  });

  it('should compute the dashboard KPIs of the own organization', async () => {
    const w = await createTrackingWorld();
    const nowSeconds = Math.floor((Date.now() - ms(at(0))) / 1000) - 5;
    await detect(w.orgA.id, w.lobbyCam, w.identity, nowSeconds);
    await detect(w.orgA.id, w.floorCam, await createIdentity(w.a), nowSeconds);
    await runSql(`INSERT INTO itap.incidents (organization_id, title, severity) VALUES
      ('${w.orgA.id}', 'A', 'critical'), ('${w.orgA.id}', 'B', 'high'), ('${w.orgA.id}', 'C', 'high');
      INSERT INTO itap.incidents (organization_id, title, severity, status, acknowledged_at, resolved_at, disposition)
      VALUES ('${w.orgA.id}', 'D', 'critical', 'resolved', now(), now(), 'benign');
      UPDATE itap.devices SET health_status = 'critical' WHERE id = '${w.lobbyCam.id}'`);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['email']);
    await runSql(`SET LOCAL session_replication_role = replica;
      INSERT INTO itap.notification_deliveries (organization_id, rule_id, event_id, recipient_address, channel, status, created_at)
      VALUES ('${w.orgA.id}', '${rule}', gen_random_uuid(), 'a@example.com', 'email', 'dead_letter', now() - interval '1 hour'),
             ('${w.orgA.id}', '${rule}', gen_random_uuid(), 'b@example.com', 'email', 'failed', now() - interval '2 days'),
             ('${w.orgA.id}', '${rule}', gen_random_uuid(), 'c@example.com', 'email', 'sent', now())`);
    const [s1, s2, s3] = [await manualSegment(w.a), await manualSegment(w.a), await manualSegment(w.a)];
    await runSql(`INSERT INTO itap.segment_daily_stats (organization_id, segment_id, day, member_count) VALUES
      ('${w.orgA.id}', '${s1.id}', (now() AT TIME ZONE 'UTC')::date - 1, 5), ('${w.orgA.id}', '${s1.id}', (now() AT TIME ZONE 'UTC')::date, 2),
      ('${w.orgA.id}', '${s2.id}', (now() AT TIME ZONE 'UTC')::date - 1, 1), ('${w.orgA.id}', '${s2.id}', (now() AT TIME ZONE 'UTC')::date, 2),
      ('${w.orgA.id}', '${s3.id}', (now() AT TIME ZONE 'UTC')::date - 1, 4), ('${w.orgA.id}', '${s3.id}', (now() AT TIME ZONE 'UTC')::date, 4)
      ON CONFLICT (organization_id, segment_id, day) DO UPDATE SET member_count = EXCLUDED.member_count`);
    const fields = `unique_visitors_today current_occupancy open_incidents open_incidents_critical open_incidents_high
      open_incidents_medium devices_offline deliveries_failed_24h segment_top_movers`;
    const [kpis] = await query<Record<string, unknown>>(w.a, 'dashboard_kpis', {}, fields);
    expect(kpis).toMatchObject({
      unique_visitors_today: 2, current_occupancy: 2, open_incidents: 3, open_incidents_critical: 1, open_incidents_high: 2,
      open_incidents_medium: 0, devices_offline: 1, deliveries_failed_24h: 1,
    });
    expect(kpis.segment_top_movers).toEqual([
      expect.objectContaining({ segment_id: s1.id, member_count: 2, previous_count: 5, change: -3 }),
      expect.objectContaining({ segment_id: s2.id, member_count: 2, previous_count: 1, change: 1 }),
    ]);
    const [other] = await query<Record<string, unknown>>(asOrgAdmin(w.other.id, w.orgB.id), 'dashboard_kpis', {}, fields);
    expect(other).toMatchObject({ unique_visitors_today: 0, current_occupancy: 0, open_incidents: 0, devices_offline: 0, segment_top_movers: [] });
  });
});
