import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHasuraClient, HasuraError } from './client.js';
import type { Env } from '../config/env.js';

const env: Env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action',
  NHOST_STORAGE_URL: 'http://storage.test',
  ORG_TOKEN_TTL_SECONDS: 900,
};

function stubFetch(body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('createHasuraClient', () => {
  it('forwards session headers alongside the admin secret', async () => {
    const fn = stubFetch({ data: { ok: true } });
    const client = createHasuraClient(env, { role: 'org_admin', userId: 'u1', organizationId: 'o1' });
    const data = await client.request<{ ok: boolean }>('query { ok }', { a: 1 });
    expect(data).toEqual({ ok: true });
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(env.HASURA_GRAPHQL_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers['x-hasura-admin-secret']).toBe('admin-secret');
    expect(headers['x-hasura-role']).toBe('org_admin');
    expect(headers['x-hasura-user-id']).toBe('u1');
    expect(headers['x-hasura-organization-id']).toBe('o1');
    expect(JSON.parse(init.body as string)).toEqual({ query: 'query { ok }', variables: { a: 1 } });
  });

  it('sends only the admin secret without a session', async () => {
    const fn = stubFetch({ data: {} });
    await createHasuraClient(env).request('query { ok }');
    const headers = (fn.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;
    expect(headers['x-hasura-admin-secret']).toBe('admin-secret');
    expect(headers['x-hasura-role']).toBeUndefined();
  });

  it('maps GraphQL errors to HasuraError with extensions.code', async () => {
    stubFetch({ errors: [{ message: 'm', extensions: { code: 'permission-error', path: '$.x' } }] });
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HasuraError);
    expect(err).toMatchObject({ code: 'permission-error', message: 'm', path: '$.x' });
  });
});
