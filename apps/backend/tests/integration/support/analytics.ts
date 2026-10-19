import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { aggregateStatsCron } from '../../../src/events/analyticsCrons.js';
import { asAdmin, testEnv } from './clients.js';
import { createProfile } from './segments.js';
import { runSql, runSqlRows } from './sql.js';
import { closeStale } from './stageB.js';
import { at, createIdentity, createTrackingWorld, detect } from './tracking.js';

/** Analytics aggregation (slice 7, task 1): stats writers, readers and the scenario fixture. */

export const HOUR = 3600;

/** itap.aggregate_stats(org, at) through its admin-only GraphQL mutation (seconds relative to the `at()` clock). */
export async function aggregate(org: string, seconds: number): Promise<Record<string, unknown>[]> {
  const data = await asAdmin().request<{ aggregate_stats: Record<string, unknown>[] }>(
    `mutation($o: uuid!, $t: timestamptz!) { aggregate_stats(args: {p_organization: $o, p_at: $t}) {
      hour_from hour_to hourly_rows daily_rows transition_rows } }`,
    { o: org, t: at(seconds) },
  );
  return data.aggregate_stats;
}

/** itap.aggregate_stats_range(org, from, to) (admin-only). */
export async function aggregateRange(org: string, from: number, to: number): Promise<Record<string, unknown>[]> {
  const data = await asAdmin().request<{ aggregate_stats_range: Record<string, unknown>[] }>(
    `mutation($o: uuid!, $f: timestamptz!, $t: timestamptz!) { aggregate_stats_range(args: {p_organization: $o, p_from: $f, p_to: $t}) {
      hour_from hour_to hourly_rows daily_rows transition_rows } }`,
    { o: org, f: at(from), t: at(to) },
  );
  return data.aggregate_stats_range;
}

const epoch = (column: string) => `(extract(epoch FROM ${column}))::bigint AS ${column}`;

/** Hourly rows of an organization; `area` is the area name or `facility` for the facility total row. */
export async function hourlyStats(org: string, withIds = false): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `SELECT ${withIds ? 's.id, s.updated_at, ' : ''}coalesce(a.name, 'facility') AS area, ${epoch('hour')},
       s.unique_identities, s.entries, s.exits, s.dwell_seconds, s.avg_dwell_seconds, s.peak_occupancy
     FROM itap.area_hourly_stats s LEFT JOIN itap.areas a ON a.id = s.area_id
     WHERE s.organization_id = '${org}' ORDER BY s.hour, coalesce(a.name, '')`,
  );
}

export async function dailyStats(org: string, withIds = false): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `SELECT ${withIds ? 'id, updated_at, ' : ''}facility_id, day, unique_identities, known_identities, unknown_identities,
       visits, guest_visits, avg_visit_minutes, dwell_seconds, peak_occupancy, peak_hour
     FROM itap.facility_daily_stats WHERE organization_id = '${org}' ORDER BY facility_id, day`,
  );
}

export async function transitions(org: string, withIds = false): Promise<Record<string, string | null>[]> {
  return runSqlRows(
    `SELECT ${withIds ? 't.id, t.updated_at, ' : ''}t.day, f.name AS from_area, x.name AS to_area, t.count
     FROM itap.area_transitions_daily t
     JOIN itap.areas f ON f.id = t.from_area_id JOIN itap.areas x ON x.id = t.to_area_id
     WHERE t.organization_id = '${org}' ORDER BY t.day, f.name, x.name`,
  );
}

export async function clearStats(org: string): Promise<void> {
  await runSql(`DELETE FROM itap.area_hourly_stats WHERE organization_id = '${org}';
    DELETE FROM itap.facility_daily_stats WHERE organization_id = '${org}';
    DELETE FROM itap.area_transitions_daily WHERE organization_id = '${org}'`);
}

export async function setTrackingTimeout(org: string, seconds: number): Promise<void> {
  await runSql(`UPDATE itap.organization_settings SET tracking_timeout_seconds = ${seconds} WHERE organization_id = '${org}'`);
}

/**
 * Scenario (facility in UTC, tracking timeout 2 h, base clock 08:00 UTC = 0 s):
 * - P1 (linked to a profile): entrance (Lobby) 07:50, Zone A 08:20, Lobby 09:10, last seen 09:30; closed (lost)
 *   by close_stale_sessions -> ended 09:30.
 * - P2 (unknown): Lobby 08:30, Zone A 08:40, last seen 10:20; still active.
 */
export async function statsWorld() {
  const w = await createTrackingWorld();
  await setTrackingTimeout(w.orgA.id, 7200);
  const profile = await createProfile(w.a);
  await runSql(`UPDATE itap.identities SET profile_id = '${profile}' WHERE id = '${w.identity}'`);
  const p1 = w.identity;
  const p2 = await createIdentity(w.a);
  await detect(w.orgA.id, w.entranceCam, p1, -600);
  await detect(w.orgA.id, w.floorCam, p1, 1200);
  await detect(w.orgA.id, w.lobbyCam, p2, 1800);
  await detect(w.orgA.id, w.floorCam, p2, 2400);
  await detect(w.orgA.id, w.lobbyCam, p1, 4200);
  await detect(w.orgA.id, w.lobbyCam, p1, 5400);
  await detect(w.orgA.id, w.floorCam, p2, 8400);
  await closeStale(w.orgA.id, 13000);
  return { ...w, p1, p2, profile };
}
export type StatsWorld = Awaited<ReturnType<typeof statsWorld>>;

/** The `aggregate_stats` cron handler run in-process for the given organizations only (shared dev database). */
export async function runAggregateCron(orgIds: string[], scheduledTime: string): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      const lists = data as { organizations?: { id: string }[] };
      if (lists.organizations) lists.organizations = lists.organizations.filter((o) => orgIds.includes(o.id));
      return data;
    },
  };
  const result = await aggregateStatsCron.handle(
    { id: randomUUID(), name: 'aggregate_stats', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `aggregate_stats:${randomUUID()}` },
  );
  return { ...result };
}
