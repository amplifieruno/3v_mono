import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied } from './support/fixtures.js';
import { updateByPk } from './support/operations.js';
import { mergeInto } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { closeStale } from './support/stageB.js';
import {
  HOUR,
  aggregate,
  aggregateRange,
  clearStats,
  dailyStats,
  hourlyStats,
  runAggregateCron,
  setTrackingTimeout,
  statsWorld,
  transitions,
} from './support/analytics.js';
import { at, createIdentity, createTrackingWorld, detect, sessions } from './support/tracking.js';

const BASE = Date.parse(at(0)) / 1000;
/** Expected hourly row: [area, hour offset from 08:00 UTC, unique, entries, exits, dwell, avg dwell, peak]. */
type Expected = [string, number, number, number, number, number, number, number];
const rows = (list: Expected[]) =>
  list.map(([area, h, u, en, ex, dw, avg, peak]) => ({
    area, hour: String(BASE + h * HOUR), unique_identities: String(u), entries: String(en), exits: String(ex),
    dwell_seconds: String(dw), avg_dwell_seconds: String(avg), peak_occupancy: String(peak),
  }));

/** aggregate_stats once per hour: at = 08:00 + k h aggregates the hour before it. */
async function aggregateHours(org: string, fromHour: number, toHour: number): Promise<void> {
  for (let h = fromHour + 1; h <= toHour; h += 1) await aggregate(org, h * HOUR);
}

describe('stats aggregation', () => {
  it('should split dwell across hour buckets and count each identity once per bucket', async () => {
    const w = await statsWorld();
    await aggregateHours(w.orgA.id, -1, 4);
    expect(await hourlyStats(w.orgA.id)).toEqual(
      rows([
        ['facility', -1, 1, 1, 0, 600, 600, 1],
        ['Lobby', -1, 1, 1, 0, 600, 600, 1],
        ['facility', 0, 2, 1, 0, 5400, 2700, 2],
        ['Lobby', 0, 2, 1, 2, 1800, 900, 1],
        ['Zone A', 0, 2, 2, 0, 3600, 1800, 2],
        ['facility', 1, 2, 0, 1, 5400, 2700, 2],
        ['Lobby', 1, 1, 1, 1, 1200, 1200, 1],
        ['Zone A', 1, 2, 0, 1, 4200, 2100, 2],
        ['facility', 2, 1, 0, 0, 1200, 1200, 1],
        ['Zone A', 2, 1, 0, 0, 1200, 1200, 1],
      ]),
    );
    // Known = linked to a profile at aggregation time; visits = sessions started that day (P1 100 min, P2 110 min).
    expect(await dailyStats(w.orgA.id)).toEqual([
      {
        facility_id: w.facility.id, day: '2026-01-05', unique_identities: '2', known_identities: '1',
        unknown_identities: '1', visits: '2', guest_visits: '0', avg_visit_minutes: '105.00', dwell_seconds: '12600',
        peak_occupancy: '2', peak_hour: '8',
      },
    ]);
    expect(await transitions(w.orgA.id)).toEqual([
      { day: '2026-01-05', from_area: 'Lobby', to_area: 'Zone A', count: '2' },
      { day: '2026-01-05', from_area: 'Zone A', to_area: 'Lobby', count: '1' },
    ]);
    // Read-only, tenant-scoped.
    const id = (await runSqlRows(`SELECT id FROM itap.area_hourly_stats WHERE organization_id = '${w.orgA.id}' LIMIT 1`))[0].id;
    await expectDenied(updateByPk(w.a, 'area_hourly_stats', String(id), { entries: 9 }), 'update_area_hourly_stats_by_pk');
    const seen = await w.a.request<{ area_hourly_stats: unknown[]; facility_daily_stats: unknown[]; area_transitions_daily: unknown[] }>(
      `query { area_hourly_stats { id } facility_daily_stats { id } area_transitions_daily { id } }`,
    );
    expect([seen.area_hourly_stats.length, seen.facility_daily_stats.length, seen.area_transitions_daily.length]).toEqual([10, 1, 2]);
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    expect((await b.request<{ area_hourly_stats: unknown[] }>(`query { area_hourly_stats { id } }`)).area_hourly_stats).toEqual([]);
  });

  it('should re-aggregate the same hour idempotently and drop rows whose data vanished', async () => {
    const w = await statsWorld();
    await aggregateHours(w.orgA.id, -1, 4);
    const snapshot = [await hourlyStats(w.orgA.id, true), await dailyStats(w.orgA.id, true), await transitions(w.orgA.id, true)];
    // Cron retries, a seed rerun and a range over the same hours change nothing (same row ids, no updated_at bump).
    await aggregateHours(w.orgA.id, -1, 4);
    await aggregate(w.orgA.id, 2 * HOUR);
    await aggregateRange(w.orgA.id, -HOUR, 4 * HOUR);
    expect([await hourlyStats(w.orgA.id, true), await dailyStats(w.orgA.id, true), await transitions(w.orgA.id, true)]).toEqual(snapshot);
    // P2's session is removed (retention): its buckets are recomputed, the 10:00 hour has no data left.
    const [p2Session] = await sessions(w.p2);
    await runSql(`DELETE FROM itap.tracking_sessions WHERE id = '${p2Session.id}'`);
    await aggregateRange(w.orgA.id, -HOUR, 4 * HOUR);
    const hourly = await hourlyStats(w.orgA.id);
    expect(hourly.filter((r) => r.hour === String(BASE + 2 * HOUR))).toEqual([]);
    expect(hourly.find((r) => r.area === 'Zone A' && r.hour === String(BASE))).toMatchObject({ unique_identities: '1', peak_occupancy: '1' });
    expect(await transitions(w.orgA.id)).toEqual([
      { day: '2026-01-05', from_area: 'Lobby', to_area: 'Zone A', count: '1' },
      { day: '2026-01-05', from_area: 'Zone A', to_area: 'Lobby', count: '1' },
    ]);
  });

  it('should produce the same rows from aggregate_stats_range as from hour-by-hour runs', async () => {
    const w = await statsWorld();
    await aggregateHours(w.orgA.id, -1, 4);
    const hourByHour = [await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)];
    await clearStats(w.orgA.id);
    // Not hour-aligned: complete hours in [06:58:20, 12:01:40) = 07:00 .. 12:00.
    const [result] = await aggregateRange(w.orgA.id, -HOUR - 100, 4 * HOUR + 100);
    expect(result).toMatchObject({ hour_from: at(-HOUR).replace('.000Z', '+00:00'), hour_to: at(4 * HOUR).replace('.000Z', '+00:00') });
    expect([await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)]).toEqual(hourByHour);
  });

  it('should count sessions across a facility-local midnight into both local days', async () => {
    const w = await createTrackingWorld();
    await setTrackingTimeout(w.orgA.id, 7200);
    await updateByPk(w.a, 'facilities', w.facility.id, { timezone: 'Europe/Moscow' });
    // 20:30 UTC = 23:30 Moscow: Lobby; 21:10 UTC (00:10 local, next day) Zone A; last seen 21:30 UTC; closed.
    await detect(w.orgA.id, w.lobbyCam, w.identity, 45000);
    await detect(w.orgA.id, w.floorCam, w.identity, 47400);
    await detect(w.orgA.id, w.floorCam, w.identity, 48600);
    await closeStale(w.orgA.id, 56000);
    await aggregateHours(w.orgA.id, 12, 14);
    expect(await hourlyStats(w.orgA.id)).toEqual(
      rows([
        ['facility', 12, 1, 1, 0, 1800, 1800, 1],
        ['Lobby', 12, 1, 1, 0, 1800, 1800, 1],
        ['facility', 13, 1, 0, 1, 1800, 1800, 1],
        ['Lobby', 13, 1, 0, 1, 600, 600, 1],
        ['Zone A', 13, 1, 1, 1, 1200, 1200, 1],
      ]),
    );
    const day = { facility_id: w.facility.id, unique_identities: '1', known_identities: '0', unknown_identities: '1', guest_visits: '0', dwell_seconds: '1800', peak_occupancy: '1' };
    const byDay = [
      { ...day, day: '2026-01-05', visits: '1', avg_visit_minutes: '60.00', peak_hour: '23' },
      { ...day, day: '2026-01-06', visits: '0', avg_visit_minutes: 'NULL', peak_hour: '0' },
    ];
    expect(await dailyStats(w.orgA.id)).toEqual(byDay);
    expect(await transitions(w.orgA.id)).toEqual([{ day: '2026-01-06', from_area: 'Lobby', to_area: 'Zone A', count: '1' }]);
    // Equivalence across the day boundary.
    const hourByHour = [await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)];
    await clearStats(w.orgA.id);
    await aggregateRange(w.orgA.id, 12 * HOUR, 14 * HOUR);
    expect([await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)]).toEqual(hourByHour);
  });

  it('should keep presence inside its session: a location after ended_at in the next hour changes nothing', async () => {
    const w = await createTrackingWorld();
    await setTrackingTimeout(w.orgA.id, 600);
    // Lobby 08:00 .. 08:40, closed (ended 08:40); then a stray estimated location in Zone A at 09:10 (after ended_at).
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 2400);
    await closeStale(w.orgA.id, 3300);
    const [session] = await sessions(w.identity);
    await runSql(`INSERT INTO itap.identity_locations (organization_id, identity_id, session_id, facility_id, area_id,
        movement_type, is_estimated, occurred_at)
      VALUES ('${w.orgA.id}', '${w.identity}', '${session.id}', '${w.facility.id}', '${w.zone.id}', 'movement', true, '${at(4200)}')`);
    await aggregateHours(w.orgA.id, -1, 3);
    const hourByHour = [await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)];
    expect(hourByHour[0].map((r) => r.area)).not.toContain('Zone A');
    expect(hourByHour[2]).toEqual([]);
    await clearStats(w.orgA.id);
    await aggregateRange(w.orgA.id, -HOUR, 3 * HOUR);
    expect([await hourlyStats(w.orgA.id), await dailyStats(w.orgA.id), await transitions(w.orgA.id)]).toEqual(hourByHour);
  });

  it('should count merged identities once (effective identity) in unique, dwell and peak', async () => {
    const w = await createTrackingWorld();
    await setTrackingTimeout(w.orgA.id, 7200);
    const source = await createIdentity(w.a);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await detect(w.orgA.id, w.lobbyCam, source, 300);
    await detect(w.orgA.id, w.lobbyCam, w.identity, 600);
    await detect(w.orgA.id, w.lobbyCam, source, 1200);
    await aggregate(w.orgA.id, HOUR);
    const lobby = async () => (await hourlyStats(w.orgA.id)).find((r) => r.area === 'Lobby');
    expect(await lobby()).toMatchObject({ unique_identities: '2', entries: '2', dwell_seconds: '1500', avg_dwell_seconds: '750', peak_occupancy: '2' });
    await mergeInto(w.a, w.identity, [source]);
    await aggregate(w.orgA.id, HOUR);
    expect(await lobby()).toMatchObject({ unique_identities: '1', entries: '2', dwell_seconds: '1200', avg_dwell_seconds: '1200', peak_occupancy: '1' });
    expect(await dailyStats(w.orgA.id)).toEqual([expect.objectContaining({ unique_identities: '1', visits: '2' })]);
  });

  it('should aggregate the trailing window before the scheduled time per organization from the cron handler', async () => {
    const w = await statsWorld();
    const result = await runAggregateCron([w.orgA.id, w.orgB.id], at(HOUR + 300));
    expect(result).toEqual({ organizations: 2, rows: 2 });
    // Timeout 2 h: [hour(09:05 - 2 h - 180 s) - 1 h, 09:00) = 06:00 .. 09:00 (no data at 06:00).
    expect((await hourlyStats(w.orgA.id)).map((r) => r.hour)).toEqual([...Array(2).fill(String(BASE - HOUR)), ...Array(3).fill(String(BASE))]);
    expect(await dailyStats(w.orgA.id)).toHaveLength(1);
    expect(await hourlyStats(w.orgB.id)).toEqual([]);
    await expect(runAggregateCron([w.orgA.id], 'not a time')).rejects.toThrow(/scheduled_time/);
  });
});
