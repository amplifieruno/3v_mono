import { expect } from 'vitest';
import { seedCounts } from './seedState.js';
import { runSqlRows } from './sql.js';

/** Assertions on the replayed Nova Tower history (slices 4-7), shared by the seed test. */
export async function expectSeededHistory(slug: string): Promise<void> {
  const nova = await seedCounts(slug);
  expect(nova.detections).toBeGreaterThan(10_000);
  expect(nova.history_events).toBeGreaterThan(1_000);
  expect(nova.watch_lists).toBe(3);
  expect(nova.watch_list_entries).toBeGreaterThanOrEqual(5);
  // Blacklist and watch-list matches are separate rules (only blacklist incidents escalate); + the segment-scoped rule.
  expect(nova.event_rules).toBe(8);
  expect(nova.shift_handovers).toBe(3);
  expect(nova.operator_workspaces).toBe(4);
  const org = `(select id from itap.organizations where slug = '${slug}')`;

  const [span] = await runSqlRows(
    `select (min(detected_at) < now() - interval '29 days')::text as old, (max(detected_at) < now() - interval '1 hour')::text as recent,
            (select count(*) from itap.tracking_sessions where organization_id = ${org} and status in ('completed', 'lost')) as closed,
            (select count(*) from itap.tracking_sessions where organization_id = ${org}) as sessions,
            (select count(*) from itap.tracking_sessions where organization_id = ${org} and visit_id is not null) as with_visit,
            (select count(*) from itap.identity_locations where organization_id = ${org} and is_estimated) as estimated
       from itap.detections where organization_id = ${org}`,
  );
  expect(span).toMatchObject({ old: 'true', recent: 'true' });
  expect(Number(span.closed)).toBeGreaterThan(Number(span.sessions) * 0.98);
  expect(Number(span.with_visit)).toBeGreaterThan(0);
  expect(Number(span.estimated)).toBeGreaterThan(0);

  const types = await runSqlRows(
    `select event_type, count(*) as n from itap.events where organization_id = ${org} group by event_type`,
  );
  const byType = Object.fromEntries(types.map((t) => [t.event_type, Number(t.n)]));
  // Events of every type the pipeline produces today (design §9); tailgating / access and auth events have no
  // producer before slice 8.
  for (const type of ['detection_known', 'detection_unknown', 'vip_arrival', 'blacklist_match', 'watchlist_match',
    'after_hours', 'restricted_area_entry', 'loitering', 'unexpected_facility', 'occupancy_exceeded', 'unusual_dwell',
    'inactive_profile_detected', 'device_offline', 'device_online', 'abnormal_movement', 'report_generated']) {
    expect(byType[type] ?? 0, type).toBeGreaterThanOrEqual(1);
  }
  // Overfilled once (one 15-minute bucket of Meeting Room 12A); the terminated contractor seen once; one outage.
  expect(byType.occupancy_exceeded).toBe(1);
  expect(byType.inactive_profile_detected).toBe(1);
  expect([byType.device_offline, byType.device_online]).toEqual([1, 1]);
  const [coverage] = await runSqlRows(
    `select (select a.name from itap.events e join itap.areas a on a.id = e.area_id
              where e.organization_id = ${org} and e.event_type = 'occupancy_exceeded') as overfilled,
            (select p.status from itap.events e join itap.profiles p on p.id = e.profile_id
              where e.organization_id = ${org} and e.event_type = 'inactive_profile_detected') as inactive_status,
            (select d.name from itap.events e join itap.devices d on d.id = e.device_id
              where e.organization_id = ${org} and e.event_type = 'device_offline') as offline_device,
            (select (d.last_seen_at > now() - interval '2 hours')::text from itap.devices d
              where d.organization_id = ${org} and d.name = 'Parking Gate Terminal') as gate_seen_recently,
            (select count(*) from itap.events e join itap.event_rule_versions v on v.id = e.rule_version_id
              join itap.event_rules r on r.id = v.rule_id
              where e.organization_id = ${org} and e.event_type = 'unusual_dwell' and r.name = 'Long wait in the lobby lounge') as dwell_by_rule,
            (select string_agg(name, ',' order by name) from itap.event_rules where organization_id = ${org}
              and name like '%match%') as match_rules`,
  );
  expect(coverage).toMatchObject({
    overfilled: 'Meeting Room 12A',
    inactive_status: 'terminated',
    offline_device: 'Parking Gate Terminal',
    gate_seen_recently: 'true',
    match_rules: 'Blacklist match,Watch-list match',
  });
  expect(Number(coverage.dwell_by_rule)).toBeGreaterThanOrEqual(1);
  // One person in front of a camera for minutes: one detection_known per session.
  const [dupes] = await runSqlRows(
    `select count(*) as n from (select session_id from itap.events where organization_id = ${org}
       and event_type = 'detection_known' group by session_id having count(*) > 1) x`,
  );
  expect(Number(dupes.n)).toBe(0);

  const incidents = await runSqlRows(
    `select status, disposition, count(*) as n,
            bool_and(created_at < now() - interval '1 hour')::text as backdated
       from itap.incidents where organization_id = ${org} group by status, disposition`,
  );
  const statuses = new Set(incidents.map((i) => i.status));
  for (const status of ['open', 'acknowledged', 'investigating', 'resolved', 'closed']) expect(statuses.has(status), status).toBe(true);
  expect(incidents.some((i) => i.disposition === 'false_positive')).toBe(true);
  expect(incidents.every((i) => i.backdated === 'true')).toBe(true);
  expect(nova.incident_activities).toBeGreaterThan(nova.incidents * 2);
  expect(nova.incident_notes).toBeGreaterThan(0);

  const visits = await runSqlRows(`select distinct status from itap.visits where organization_id = ${org} order by status`);
  expect(visits.map((v) => v.status)).toEqual(['cancelled', 'checked_in', 'checked_out', 'no_show', 'scheduled']);

  const [config] = await runSqlRows(
    `select s.recognition_threshold::text as threshold, f.operating_hours::text as hours,
            (select count(*) from itap.event_rules r join itap.event_rule_versions v on v.id = r.current_version_id
              where r.organization_id = ${org} and v.status = 'published') as published,
            (select count(*) from itap.areas a where a.organization_id = ${org} and a.loitering_threshold_seconds is not null) as loitering,
            (select count(*) from itap.profiles p where p.organization_id = ${org} and itap.profile_is_blacklisted(p)) as blacklisted
       from itap.organization_settings s join itap.facilities f on f.organization_id = s.organization_id
      where s.organization_id = ${org}`,
  );
  expect(config.threshold).toBe('0.4');
  expect(JSON.parse(config.hours ?? '[]')).toEqual([
    { days: [1, 2, 3, 4, 5], from: '07:00', to: '21:00' },
    { days: [6], from: '09:00', to: '15:00' },
  ]);
  expect(config).toMatchObject({ published: '7', loitering: '2', blacklisted: '1' });

  const [extra] = await runSqlRows(
    `select (select count(*) from itap.profiles p where p.organization_id = ${org} and p.profile_type = 'employee'
              and not itap.profile_has_face(p)) as unlinked,
            (select count(*) from itap.event_rule_versions v where v.organization_id = ${org}
              and v.parameters ? 'watch_list_kinds') as by_kind,
            (select count(*) from (select substring(dedup_key from '^session:[^:]+') as s from itap.incidents
              where organization_id = ${org} and dedup_key like 'session:%' group by 1 having count(*) > 1) x) as doubled,
            (select count(*) from itap.watch_list_entries e where e.organization_id = ${org}
              and e.created_at > (select min(detected_at) from itap.detections d where d.organization_id = ${org})) as late_entries,
            (select count(*) from itap.visits v where v.organization_id = ${org}
              and extract(epoch from v.expected_start)::bigint % 900 <> 0) as unrounded,
            (select count(*) from itap.incidents i where i.organization_id = ${org} and i.disposition = 'false_positive'
              and exists (select 1 from itap.incident_identities x join itap.identities y on y.id = x.identity_id
                where x.incident_id = i.id and itap.profile_is_blacklisted((select p from itap.profiles p where p.id = y.profile_id)))) as persona_fp`,
  );
  expect(Number(extra.unlinked)).toBeGreaterThanOrEqual(8);
  // by_kind: VIP, watch list, and both versions of the blacklist rule (v2 adds the escalation policy).
  expect(extra).toMatchObject({ by_kind: '4', doubled: '0', late_entries: '0', unrounded: '0', persona_fp: '1' });
}
