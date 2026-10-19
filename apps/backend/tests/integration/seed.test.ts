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
