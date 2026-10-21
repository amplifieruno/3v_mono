import { describe, expect, it } from 'vitest';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';

/**
 * The two auth clients' error kinds and the organization token's expiry: only
 * a refused token is `auth` (which ends the session); a timeout, a rate limit
 * or a server failure is `transport` (kept for a retry). The expiry is stored
 * on the client's clock from the token's own lifetime.
 */

const NOW = 1_700_000_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function jwt(claims: Record<string, unknown>): string {
  const part = (value: unknown) => btoa(JSON.stringify(value)).replace(/=+$/u, '').replace(/\+/gu, '-').replace(/\//gu, '_');
  return `${part({ alg: 'HS256', typ: 'JWT' })}.${part(claims)}.sig`;
}

const nhostAnswering = (status: number) =>
  createNhostClient({ baseUrl: 'http://auth/v1', fetch: async () => json({ message: `HTTP ${status}` }, status) });

describe('nhost client errors', () => {
  it.each([400, 401])('should end the session on a refused refresh token (%i)', async (status) => {
    await expect(nhostAnswering(status).refresh('r')).rejects.toMatchObject({ kind: 'auth', status });
  });

  it.each([403, 408, 429, 500, 503])('should keep the session on a refresh answered %i', async (status) => {
    await expect(nhostAnswering(status).refresh('r')).rejects.toMatchObject({ kind: 'transport', status });
  });

  it.each([408, 429, 502])('should report a sign-in answered %i as transport', async (status) => {
    await expect(nhostAnswering(status).signIn('a@b.c', 'x')).rejects.toMatchObject({ kind: 'transport', status });
  });

  it('should report wrong credentials as auth', async () => {
    await expect(nhostAnswering(401).signIn('a@b.c', 'x')).rejects.toMatchObject({ kind: 'auth', code: 'invalid-credentials' });
  });
});

function orgClient(answer: () => Response, now = () => NOW) {
  return createOrgClient({ endpoint: 'http://hasura/v1/graphql', fetch: async () => answer(), now });
}

const switchAnswer = (row: Record<string, unknown>) => () =>
  json({ data: { switch_organization: { organization_id: 'org-1', role: 'org_admin', ...row } } });

describe('org client errors', () => {
  it.each([408, 429, 500, 503])('should report HTTP %i as transport', async (status) => {
    const client = orgClient(() => new Response('upstream down', { status }));
    await expect(client.memberships('b')).rejects.toMatchObject({ kind: 'transport', status });
  });

  it('should report a refused token as auth', async () => {
    const client = orgClient(() => json({ errors: [{ message: 'Could not verify JWT', extensions: { code: 'invalid-jwt' } }] }));
    await expect(client.memberships('b')).rejects.toMatchObject({ kind: 'auth', code: 'invalid-jwt' });
    await expect(orgClient(() => new Response('', { status: 401 })).memberships('b')).rejects.toMatchObject({ kind: 'auth' });
  });

  it('should report a refused switch as forbidden', async () => {
    const client = orgClient(() => json({ errors: [{ message: 'Membership is not active', extensions: { code: 'unexpected' } }] }));
    await expect(client.switchOrganization('b', 'org-1')).rejects.toMatchObject({ kind: 'forbidden', message: 'Membership is not active' });
  });
});

describe('org token expiry', () => {
  it("should expire after the token's lifetime on the client's clock, whatever the server clock says", async () => {
    const token = jwt({ iat: 100, exp: 1000 });
    const client = orgClient(switchAnswer({ access_token: token, expires_at: '2001-01-01T00:00:00Z' }));
    const session = await client.switchOrganization('b', 'org-1');
    expect(session.expiresAt).toBe(NOW + 900_000);
  });

  it('should fall back to expires_at for a token without lifetime claims', async () => {
    const client = orgClient(switchAnswer({ access_token: 'opaque', expires_at: '2030-01-01T00:00:00Z' }));
    expect((await client.switchOrganization('b', 'org-1')).expiresAt).toBe(Date.parse('2030-01-01T00:00:00Z'));
  });

  it('should refuse a token whose expiry cannot be read instead of storing NaN', async () => {
    const client = orgClient(switchAnswer({ access_token: 'opaque', expires_at: 'soon' }));
    await expect(client.switchOrganization('b', 'org-1')).rejects.toMatchObject({ kind: 'protocol', code: 'bad-org-token' });
  });
});
