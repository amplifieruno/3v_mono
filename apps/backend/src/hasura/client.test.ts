import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHasuraClient, HasuraError } from './client.js';
import type { Env } from '../config/env.js';
import { hangingBodyFetch } from '../http/fetchStubs.js';

const env: Env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action',
  NHOST_STORAGE_URL: 'http://storage.test',
  INSIGHTFACE_API_URL: 'http://insightface.test',
  ORG_TOKEN_TTL_SECONDS: 900,
};

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
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

  it('should keep the Postgres SQLSTATE of an internal error', async () => {
    stubFetch({
      errors: [{ message: 'database query error', extensions: { code: 'unexpected', internal: { error: { message: 'deadlock detected', status_code: '40P01' } } } }],
    });
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'unexpected', detail: 'deadlock detected', sqlState: '40P01' });
  });

  it('should map a top-level Hasura error ({code,error}) to HasuraError', async () => {
    stubFetch({ code: 'access-denied', error: 'invalid x-hasura-admin-secret', path: '$' }, 401);
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HasuraError);
    expect(err).toMatchObject({ code: 'access-denied', message: 'invalid x-hasura-admin-secret' });
  });

  it('should throw HasuraError on a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad Gateway</html>', { status: 502 })));
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HasuraError);
    expect(err).toMatchObject({ code: 'http-502' });
    expect((err as HasuraError).message).toContain('Bad Gateway');
  });

  it('should throw HasuraError on a non-2xx JSON body without errors', async () => {
    stubFetch({ unexpected: true }, 500);
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HasuraError);
    expect(err).toMatchObject({ code: 'http-500' });
  });

  it('should throw HasuraError when a 2xx body has no data', async () => {
    stubFetch({});
    const err = await createHasuraClient(env).request('query { x }').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HasuraError);
    expect(err).toMatchObject({ code: 'http-200' });
  });
});

describe('createHasuraClient timeout', () => {
  it('should fail with a HasuraError when Hasura does not answer within timeoutMs', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
          }),
      ),
    );
    const client = createHasuraClient(env, undefined, { timeoutMs: 20 });
    const error = await client.request('query { ok }').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HasuraError);
    expect((error as HasuraError).code).toBe('timeout');
  });

  it('should not set a timeout unless asked', async () => {
    const fn = stubFetch({ data: { ok: true } });
    await createHasuraClient(env).request('query { ok }');
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeUndefined();
  });
});

describe('createHasuraClient timeout during the body read', () => {
  it('should fail with HasuraError code timeout instead of a raw DOMException', async () => {
    vi.stubGlobal('fetch', hangingBodyFetch());
    const error = await createHasuraClient(env, undefined, { timeoutMs: 20 }).request('query { ok }').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HasuraError);
    expect((error as HasuraError).code).toBe('timeout');
  });
});
