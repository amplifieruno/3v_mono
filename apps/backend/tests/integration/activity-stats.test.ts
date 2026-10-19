import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied } from './support/fixtures.js';
import { updateByPk } from './support/operations.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';
import { at, createIdentity, createTrackingWorld, detect } from './support/tracking.js';

const DAY = 86400;
// Timestamps as epoch milliseconds (run_sql returns text).
const STAT_COLUMNS = `visits_last_30d, avg_dwell_minutes, after_hours_visits_30d, top_area_id,
  (extract(epoch FROM last_seen_at) * 1000)::bigint AS last_seen_at, (extract(epoch FROM as_of) * 1000)::bigint AS as_of`;

async function refresh(org: string, seconds: number): Promise<void> {
  await runSql(`SELECT itap.refresh_activity_stats('${org}', '${at(seconds)}')`);
}

const identityStats = (org: string) =>
  runSqlRows(`SELECT identity_id AS subject, ${STAT_COLUMNS} FROM itap.identity_activity_stats WHERE organization_id = '${org}' ORDER BY identity_id`);
const profileStats = (org: string) =>
  runSqlRows(`SELECT profile_id AS subject, ${STAT_COLUMNS} FROM itap.profile_activity_stats WHERE organization_id = '${org}' ORDER BY profile_id`);

const afterHours = (org: string, identity: string, seconds: number) =>
  runSql(
    `INSERT INTO itap.events (organization_id, event_type, severity, identity_id, title, occurred_at)
     VALUES ('${org}', 'after_hours', 'medium', '${identity}', 'Presence outside operating hours', '${at(seconds)}')`,
  );

const ms = (value: string | null | undefined): number => Number(value);

describe('activity stats', () => {
  it('should compute identity and profile metrics for the 30 days before the given time, idempotently', async () => {
    const w = await createTrackingWorld();
    const i2 = await createIdentity(w.a);
    const linked = await createProfile(w.a);
    const faceless = await createProfile(w.a);
    await runSql(`UPDATE itap.identities SET profile_id = '${linked}' WHERE id IN ('${w.identity}', '${i2}')`);
    // Identity 1: day 1 lobby -> zone (4 min), day 2 lobby (3 min, still active). Identity 2: day 3 lobby (2 min).
    await detect(w.orgA.id, w.entranceCam, w.identity, 0);
    await detect(w.orgA.id, w.floorCam, w.identity, 240);
    await detect(w.orgA.id, w.lobbyCam, w.identity, DAY);
    await detect(w.orgA.id, w.lobbyCam, w.identity, DAY + 180);
    await detect(w.orgA.id, w.lobbyCam, i2, 2 * DAY);
    await detect(w.orgA.id, w.lobbyCam, i2, 2 * DAY + 120);
    await afterHours(w.orgA.id, w.identity, 100);
    await afterHours(w.orgA.id, w.identity, -40 * DAY); // outside the window
    await refresh(w.orgA.id, 3 * DAY);
    const first = await identityStats(w.orgA.id);
    const byId = Object.fromEntries(first.map((r) => [r.subject, r]));
    expect(byId[w.identity]).toMatchObject({ visits_last_30d: '2', avg_dwell_minutes: '3.50', after_hours_visits_30d: '1', top_area_id: w.lobby.id });
    expect(ms(byId[w.identity].last_seen_at)).toBe(Date.parse(at(DAY + 180)));
    expect(byId[i2]).toMatchObject({ visits_last_30d: '1', avg_dwell_minutes: '2.00', after_hours_visits_30d: '0', top_area_id: w.lobby.id });
    const profiles = await profileStats(w.orgA.id);
    // Rolled up over linked identities; a profile without identities has no row (metrics null -> comparisons false).
    expect(profiles.map((r) => r.subject)).toEqual([linked]);
    expect(profiles[0]).toMatchObject({ visits_last_30d: '3', avg_dwell_minutes: '3.00', after_hours_visits_30d: '1', top_area_id: w.lobby.id });
    expect(ms(profiles[0].last_seen_at)).toBe(Date.parse(at(2 * DAY + 120)));
    // Null-safe filtering through the relationship: the faceless profile never matches a metric comparison.
    const filter = async (where: string): Promise<string[]> =>
      (await w.a.request<{ profiles: { id: string }[] }>(`query { profiles(where: ${where}) { id } }`)).profiles.map((p) => p.id);
    expect(await filter(`{profile_activity_stats: {visits_last_30d: {_gte: 0}}}`)).toEqual([linked]);
    expect(await filter(`{profile_activity_stats: {visits_last_30d: {_lt: 100}}}`)).toEqual([linked]);
    expect(await filter(`{id: {_eq: "${faceless}"}, profile_activity_stats: {avg_dwell_minutes: {_gt: 0}}}`)).toEqual([]);
    // Idempotent.
    await refresh(w.orgA.id, 3 * DAY);
    expect(await identityStats(w.orgA.id)).toEqual(first);
    expect(await profileStats(w.orgA.id)).toEqual(profiles);
    // Later: nothing in the window, but last_seen_at is kept; an unlinked profile loses its row.
    await runSql(`UPDATE itap.identities SET profile_id = NULL WHERE id IN ('${w.identity}', '${i2}')`);
    await refresh(w.orgA.id, 40 * DAY);
    const late = Object.fromEntries((await identityStats(w.orgA.id)).map((r) => [r.subject, r]));
    expect(late[w.identity]).toMatchObject({ visits_last_30d: '0', avg_dwell_minutes: 'NULL', after_hours_visits_30d: '0', top_area_id: 'NULL' });
    expect(ms(late[w.identity].last_seen_at)).toBe(Date.parse(at(DAY + 180)));
    expect(ms(late[w.identity].as_of)).toBe(Date.parse(at(40 * DAY)));
    expect(await profileStats(w.orgA.id)).toEqual([]);
    // Another organization is untouched; org_admin reads but never writes the stats.
    expect(await identityStats(w.orgB.id)).toEqual([]);
    const seen = await w.a.request<{ identity_activity_stats: { identity_id: string; identity: { id: string } }[] }>(
      `query { identity_activity_stats { identity_id identity { id } } }`,
    );
    expect(seen.identity_activity_stats.map((r) => r.identity.id).sort()).toEqual([w.identity, i2].sort());
    const statId = (await runSqlRows(`SELECT id FROM itap.identity_activity_stats WHERE identity_id = '${w.identity}'`))[0].id;
    await expectDenied(updateByPk(w.a, 'identity_activity_stats', String(statId), { visits_last_30d: 9 }), 'update_identity_activity_stats_by_pk');
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    expect((await b.request<{ identity_activity_stats: unknown[] }>(`query { identity_activity_stats { id } }`)).identity_activity_stats).toEqual([]);
  });
});
