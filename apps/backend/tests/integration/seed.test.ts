import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asBearer, testEnv } from './support/clients.js';
import { requireBackend } from './support/backend.js';
import { asAdminWithSession } from './support/faces.js';
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
    expect(first.members).toBe(4);
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
    // Hourly samples for 30 days per device, minus the offline gaps.
    expect(nova.seeded_health_metrics).toBeGreaterThan(nova.devices * 700);
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

    // Seeded samples sit on whole hours; the plan geometry lies inside its floor plan.
    const [offHour] = await runSqlRows(
      `select count(*) as n from itap.device_health_metrics m join itap.devices d on d.id = m.device_id
        where m.recorded_at < d.created_at and date_trunc('hour', m.recorded_at) <> m.recorded_at`,
    );
    expect(Number(offHour.n)).toBe(0);
  });

  it('should recreate the organizations with --reset', async () => {
    const before = await state();
    await seed('--reset');
    const after = await state();
    expect(after.orgs.map((o) => o.slug)).toEqual(SLUGS);
    expect(after.members).toBe(4);
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
