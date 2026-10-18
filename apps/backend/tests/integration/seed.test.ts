import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { asAdmin, asBearer, testEnv } from './support/clients.js';
import { requireBackend } from './support/backend.js';

const run = promisify(execFile);
const SLUGS = ['nova-tower', 'riverside-office-park'];

function seed(...args: string[]): Promise<unknown> {
  return run('pnpm', ['exec', 'tsx', 'src/seed/index.ts', ...args], { env: process.env, timeout: 120_000 });
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

beforeAll(requireBackend);

describe('seed', () => {
  it('should be idempotent and let admin@itap.demo sign in and switch into both orgs', async () => {
    await seed();
    const first = await state();
    await seed();
    const second = await state();

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
  });

  it('should recreate the organizations with --reset', async () => {
    const before = await state();
    await seed('--reset');
    const after = await state();
    expect(after.orgs.map((o) => o.slug)).toEqual(SLUGS);
    expect(after.members).toBe(4);
    expect(after.orgs.map((o) => o.id)).not.toEqual(before.orgs.map((o) => o.id));
    expect(testEnv().SEED_PASSWORD).toBeTruthy();
  });
});
