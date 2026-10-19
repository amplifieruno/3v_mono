import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asBearer, testEnv } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { asAdminWithSession } from './support/faces.js';
import { expectSeededAnalytics } from './support/seedAnalytics.js';
import { expectSeededNotifications } from './support/seedNotifications.js';
import { expectSeededSegments } from './support/seedSegments.js';
import { seedCounts, seededTemplate } from './support/seedState.js';
import { runSqlRows } from './support/sql.js';

const run = promisify(execFile);
const SLUGS = ['nova-tower', 'riverside-office-park'];

function seed(...args: string[]): Promise<unknown> {
  return run('pnpm', ['exec', 'tsx', 'src/seed/index.ts', ...args], { env: process.env, timeout: 900_000 });
}

function authUrl(): string {
  const explicit = process.env.NHOST_AUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, '');
  return `http://${process.env.AUTH_URL ?? 'local.auth.local.nhost.run'}/v1`;
}

type State = { orgs: { id: string; slug: string }[]; members: number };

async function state(): Promise<State> {
  const data = await asAdmin().request<{
    organizations: { id: string; slug: string }[];
    organization_members_aggregate: { aggregate: { count: number } };
  }>(
    `query ($slugs: [String!]!) {
      organizations(where: { slug: { _in: $slugs } }, order_by: { slug: asc }) { id slug }
      organization_members_aggregate(where: { organization: { slug: { _in: $slugs } } }) { aggregate { count } }
    }`,
    { slugs: SLUGS },
  );
  return { orgs: data.organizations, members: data.organization_members_aggregate.aggregate.count };
}

// Opt-in: `seed --reset` recreates the demo organizations (new ids), which would disturb a dev database in use.
const RUN_SEED_TEST = process.env.RUN_SEED_TEST === '1';

describe.skipIf(!RUN_SEED_TEST)('seed (skipped unless RUN_SEED_TEST=1: it resets the demo organizations)', () => {
  beforeAll(requireBackend);

  // Seeding enrolls the manifest faces through InsightFace on CPU.
  const SLOW = 1_800_000;

  it('should be idempotent and let admin@itap.demo sign in and switch into both orgs', async () => {
    await seed();
    const first = await state();
    const firstCounts = { nova: await seedCounts(SLUGS[0]), riverside: await seedCounts(SLUGS[1]) };
    await seed();
    const second = await state();
    const secondCounts = { nova: await seedCounts(SLUGS[0]), riverside: await seedCounts(SLUGS[1]) };
    expect(secondCounts).toEqual(firstCounts);

    expect(first.orgs.map((o) => o.slug)).toEqual(SLUGS);
    // 3 admins (one in both orgs) and the Nova security operator.
    expect(first.members).toBe(5);
    expect(second).toEqual(first);

    const res = await fetch(`${authUrl()}/signin/email-password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'admin@itap.demo', password: process.env.SEED_PASSWORD }),
    });
    expect(res.status).toBe(200);
    const { session } = (await res.json()) as { session: { accessToken: string } };

    for (const org of first.orgs) {
      const data = await asBearer(session.accessToken).request<{
        switch_organization: { organization_id: string };
      }>(
        `mutation ($id: uuid!) { switch_organization(organization_id: $id) { organization_id } }`,
        { id: org.id },
      );
      expect(data.switch_organization.organization_id).toBe(org.id);
    }
  }, SLOW);

  it('should seed Nova Tower with companies, people and enrolled faces', async () => {
    const nova = await seedCounts(SLUGS[0]);
    expect(nova.profiles).toBeGreaterThanOrEqual(150);
    expect(nova.companies).toBeGreaterThanOrEqual(12);
    expect(nova.work_schedules).toBeGreaterThanOrEqual(3);
    expect(nova.custom_attribute_definitions).toBeGreaterThanOrEqual(4);
    expect(nova.identities_with_templates).toBeGreaterThanOrEqual(10);
    expect(nova.vips_with_face).toBeGreaterThanOrEqual(1);
    expect(nova.camera_identities).toBeGreaterThanOrEqual(2);
    expect(nova.withdrawn_consents).toBe(2);
    expect(nova.profile_documents).toBeGreaterThan(0);
    expect(nova.verification_requests).toBeGreaterThan(0);
    expect(nova.identity_duplicate_candidates).toBeGreaterThanOrEqual(3);
    expect(nova.identity_merges).toBe(1);

    const riverside = await seedCounts(SLUGS[1]);
    expect(riverside.profiles).toBeGreaterThan(0);
    expect(riverside.companies).toBeGreaterThan(0);
    expect(riverside.profiles).toBeLessThan(nova.profiles);

    const template = await seededTemplate(SLUGS[0]);
    const org = (await state()).orgs.find((o) => o.slug === SLUGS[0]);
    const data = await asAdminWithSession(org?.id).request<{ match_face: { identity_id: string }[] }>(
      `query ($e: String!) { match_face(args: { p_embedding: $e, p_limit: 1 }) { identity_id } }`,
      { e: template.embedding },
    );
    expect(data.match_face[0]?.identity_id).toBe(template.identityId);
  });

  it('should seed the Nova Tower layout, devices and 30 days of device health', async () => {
    const nova = await seedCounts(SLUGS[0]);
    expect(nova.facilities).toBe(1);
    expect(nova.areas).toBeGreaterThanOrEqual(55);
    expect(nova.areas).toBeLessThanOrEqual(70);
    expect(nova.areas_with_shape).toBeGreaterThan(10);
    expect(nova.floor_plans).toBe(3);
    expect(nova.floor_plans_with_image).toBe(3);
    expect(nova.access_points).toBe(10);
    expect(nova.devices).toBeGreaterThanOrEqual(14);
    expect(nova.streaming_cameras).toBe(4);
    expect(nova.access_point_devices).toBeGreaterThanOrEqual(11);
    expect(nova.device_areas).toBeGreaterThan(0);
    expect(nova.facility_templates).toBe(1);
    // Hourly samples for 30 days per device, minus the offline gaps (the meeting-room camera has no stream: never
    // probed, no history).
    expect(nova.seeded_health_metrics).toBeGreaterThan((nova.devices - 1) * 700);
    // 3 offline incidents: offline + online each.
    expect(nova.seeded_device_events).toBe(6);
    expect(nova.photos_with_device).toBeGreaterThanOrEqual(4);

    const riverside = await seedCounts(SLUGS[1]);
    expect(riverside.facilities).toBe(1);
    expect(riverside.areas).toBe(5);
    expect(riverside.devices).toBe(2);
    expect(riverside.streaming_cameras).toBe(0);

    const cameras = await runSqlRows(
      `select d.name, d.stream_url, d.recognition_enabled, d.recognition_fps from itap.devices d
         join itap.organizations o on o.id = d.organization_id
        where o.slug = '${SLUGS[0]}' and d.stream_url is not null order by d.stream_url`,
    );
    expect(cameras.map((c) => [c.name, c.stream_url])).toEqual([
      ['Main Entrance Camera', 'rtsp://mediamtx:8554/entrance'],
      ['Lobby Camera', 'rtsp://mediamtx:8554/lobby'],
      ['Server Room Camera', 'rtsp://mediamtx:8554/serverroom'],
      ['Loading Dock Camera', 'rtsp://mediamtx:8554/warehouse'],
    ]);
    // Live recognition is started on demand (recognition_start); seeded cameras only carry the fps.
    expect(cameras.every((c) => c.recognition_enabled === 'f' && c.recognition_fps === '2')).toBe(true);

    // Floors are zero-padded; seeded camera history has no frame rate (the live probe writes none).
    const floors = await runSqlRows(
      `select a.name from itap.areas a join itap.organizations o on o.id = a.organization_id
        where o.slug = '${SLUGS[0]}' and a.name ~ '^Floor [0-9]+$' order by a.name`,
    );
    expect(floors).toHaveLength(23);
    expect(floors.every((f) => /^Floor \d\d$/.test(f.name ?? ''))).toBe(true);
    expect(floors[0]?.name).toBe('Floor 02');
    const [frames] = await runSqlRows(
      `select count(*) as n from itap.device_health_metrics m join itap.devices d on d.id = m.device_id
        where d.stream_url is not null and m.frame_rate is not null`,
    );
    expect(Number(frames.n)).toBe(0);

    // A camera without a stream_url is never probed: state unknown, no history.
    const [unprobed] = await runSqlRows(
      `select d.health_status, d.last_seen_at, (select count(*) from itap.device_health_metrics m where m.device_id = d.id) as metrics
         from itap.devices d join itap.organizations o on o.id = d.organization_id
        where o.slug = '${SLUGS[1]}' and d.name = 'Front Door Camera'`,
    );
    expect(unprobed).toMatchObject({ health_status: 'unknown', last_seen_at: 'NULL', metrics: '0' });

    // Seeded samples sit on whole hours (the live health cron may probe a just-recreated camera, hence the hour of slack); the plan geometry lies inside its floor plan.
    const [offHour] = await runSqlRows(
      `select count(*) as n from itap.device_health_metrics m join itap.devices d on d.id = m.device_id
        where m.recorded_at < d.created_at - interval '1 hour' and date_trunc('hour', m.recorded_at) <> m.recorded_at`,
    );
    expect(Number(offHour.n)).toBe(0);
  });

  it('should replay 30 days of Nova Tower history through the detection pipeline', async () => {
    const nova = await seedCounts(SLUGS[0]);
    expect(nova.detections).toBeGreaterThan(10_000);
    expect(nova.history_events).toBeGreaterThan(1_000);
    expect(nova.watch_lists).toBe(3);
    expect(nova.watch_list_entries).toBeGreaterThanOrEqual(5);
    // Blacklist and watch-list matches are separate rules (only blacklist incidents escalate); + the segment-scoped rule.
    expect(nova.event_rules).toBe(8);
    expect(nova.shift_handovers).toBe(3);
    expect(nova.operator_workspaces).toBe(4);
    const org = `(select id from itap.organizations where slug = '${SLUGS[0]}')`;

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
  });

  it('should seed notification configuration and replay-compatible notification history', async () => {
    await expectSeededNotifications(SLUGS[0]);
    // Riverside has no notification configuration: Stage C wrote nothing there.
    expect((await seedCounts(SLUGS[1])).seeded_deliveries).toBe(0);
  });

  it('should seed segments of both targets with a 30-day membership history and daily stats', async () => {
    await expectSeededSegments(SLUGS[0], SLUGS[1]);
  });

  it('should seed stats, reports, searches, bulk jobs and dashboards (slice 7)', async () => {
    await expectSeededAnalytics(SLUGS[0], SLUGS[1]);
  });

  it('should give Riverside a light, separate history with one incident', async () => {
    const riverside = await seedCounts(SLUGS[1]);
    expect(riverside.detections).toBeGreaterThan(20);
    expect(riverside.incidents).toBe(1);
    const org = `(select id from itap.organizations where slug = '${SLUGS[1]}')`;
    const [row] = await runSqlRows(
      `select (select count(*) from itap.events where organization_id = ${org} and event_type = 'after_hours') as after_hours,
              (select count(*) from itap.detections d join itap.devices v on v.id = d.device_id
                where d.organization_id = ${org} and v.organization_id <> d.organization_id) as foreign_devices`,
    );
    expect(Number(row.after_hours)).toBeGreaterThanOrEqual(1);
    expect(row.foreign_devices).toBe('0');
  });

  it('should recreate the organizations with --reset', async () => {
    const before = await state();
    await seed('--reset');
    const after = await state();
    expect(after.orgs.map((o) => o.slug)).toEqual(SLUGS);
    expect(after.members).toBe(5);
    expect(after.orgs.map((o) => o.id)).not.toEqual(before.orgs.map((o) => o.id));
    expect(testEnv().SEED_PASSWORD).toBeTruthy();
    expect((await seedCounts(SLUGS[0])).profiles).toBeGreaterThanOrEqual(150);
    // The old organizations' files went through the storage service (no orphans left in their buckets).
    const oldBuckets = before.orgs.map((o) => `'${o.id}'`).join(',');
    const [orphans] = await runSqlRows(`select count(*) as n from storage.files where bucket_id in (${oldBuckets})`);
    expect(Number(orphans.n)).toBe(0);

    // A run right after a fresh seed changes nothing.
    const fresh = await seedCounts(SLUGS[0]);
    await seed();
    expect(await seedCounts(SLUGS[0])).toEqual(fresh);
  }, SLOW);
});
