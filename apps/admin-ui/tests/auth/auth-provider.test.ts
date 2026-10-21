import type { AuthContext, DataError } from '@burojs/core';
import { describe, expect, it } from 'vitest';
import { createItapAuthProvider } from '../../src/auth/auth-provider';
import { createNhostClient } from '../../src/auth/nhost-client';
import { createOrgClient } from '../../src/auth/org-client';
import { createTokenStore } from '../../src/auth/token-store';

const NOVA = '11111111-1111-4111-8111-111111111111';
const RIVER = '22222222-2222-4222-8222-222222222222';
const ctx = {} as AuthContext;

type Member = { id: string; status: string };
interface World {
  now: number;
  members: Member[];
  last: string | null;
  refreshRejected: boolean;
  switchFailure: { code: string; message: string } | null;
  calls: string[];
  switchCalls: number;
  refreshCalls: number;
  tokenSeq: number;
  holdRefresh: Promise<void> | null;
  holdSwitch: Promise<void> | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function setup(partial: Partial<World> = {}) {
  const world: World = {
    now: 1_000_000,
    members: [{ id: NOVA, status: 'active' }, { id: RIVER, status: 'active' }],
    last: NOVA,
    refreshRejected: false,
    switchFailure: null,
    calls: [],
    switchCalls: 0,
    refreshCalls: 0,
    tokenSeq: 0,
    holdRefresh: null,
    holdSwitch: null,
    ...partial,
  };
  const session = (tag: string) => ({
    session: {
      accessToken: `base-${tag}`,
      accessTokenExpiresIn: 900,
      refreshToken: `refresh-${tag}`,
      user: { id: 'user-1', email: 'admin@itap.demo', displayName: '' },
    },
  });
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    world.calls.push(url);
    if (url.endsWith('/signin/email-password')) return json(session(`s${++world.tokenSeq}`));
    if (url.endsWith('/token')) {
      world.refreshCalls += 1;
      if (world.holdRefresh) await world.holdRefresh;
      return world.refreshRejected ? json({ message: 'Invalid refresh token' }, 401) : json(session(`s${++world.tokenSeq}`));
    }
    if (url.endsWith('/signout')) return json({});
    const query = String(body.query);
    if (query.includes('switch_organization')) {
      world.switchCalls += 1;
      const held = world.holdSwitch;
      world.holdSwitch = null;
      if (held) await held;
      await Promise.resolve();
      if (world.switchFailure) {
        return json({ errors: [{ message: world.switchFailure.message, extensions: { code: world.switchFailure.code } }] });
      }
      const org = String((body.variables as { organization_id: string }).organization_id);
      return json({
        data: {
          switch_organization: {
            access_token: `org-${world.switchCalls}`,
            expires_at: new Date(world.now + 15 * 60_000).toISOString(),
            organization_id: org,
            role: 'org_admin',
          },
        },
      });
    }
    return json({
      data: {
        organization_members: world.members.map((m) => ({
          organization_id: m.id,
          role: 'admin',
          status: m.status,
          organization: { name: m.id === NOVA ? 'Nova Tower' : 'Riverside', logo_file_id: null },
        })),
        user_settings: world.last ? [{ last_organization_id: world.last }] : [],
      },
    });
  };
  const store = createTokenStore(undefined);
  const make = () =>
    createItapAuthProvider({
      store,
      nhost: createNhostClient({ baseUrl: 'http://auth/v1', fetch: fakeFetch, now: () => world.now }),
      org: createOrgClient({ endpoint: 'http://hasura/v1/graphql', fetch: fakeFetch }),
      now: () => world.now,
    });
  return { world, store, provider: make(), make };
}

const creds = { email: 'admin@itap.demo', password: 'x' };

describe('ItapAuthProvider', () => {
  it('logs in and switches to the last organization', async () => {
    const { provider, store } = setup();
    expect(await provider.login?.(creds, ctx)).toEqual({ success: true });
    expect(store.snapshot().org?.organizationId).toBe(NOVA);
    const identity = await provider.getIdentity(ctx);
    expect(identity).toMatchObject({ email: 'admin@itap.demo', name: 'admin@itap.demo', organizationId: NOVA, roles: ['org_admin'] });
    expect(identity?.memberships.map((m) => m.name)).toEqual(['Nova Tower', 'Riverside']);
  });

  it('prefers the organization given at login', async () => {
    const { provider, store } = setup();
    await provider.login?.({ ...creds, organizationId: RIVER }, ctx);
    expect(store.snapshot().org?.organizationId).toBe(RIVER);
  });

  it('logs in to the only active membership', async () => {
    const { provider, store } = setup({ members: [{ id: NOVA, status: 'inactive' }, { id: RIVER, status: 'active' }], last: null });
    await provider.login?.(creds, ctx);
    expect(store.snapshot().org?.organizationId).toBe(RIVER);
  });

  it('leaves the organization unset when the choice is ambiguous', async () => {
    const { provider, store, world } = setup({ last: null });
    expect(await provider.login?.(creds, ctx)).toEqual({ success: true });
    expect(store.snapshot().base).not.toBeNull();
    expect(store.snapshot().org).toBeNull();
    expect(world.switchCalls).toBe(0);
    expect(await provider.getToken()).toBeNull();
    expect((await provider.getIdentity(ctx))?.organizationId).toBeNull();
  });

  it('renews an org token that is about to expire', async () => {
    const { provider, world } = setup();
    await provider.login?.(creds, ctx);
    expect(await provider.getToken()).toBe('org-1');
    world.now += 15 * 60_000 - 30_000;
    expect(await provider.getToken()).toBe('org-2');
    expect(world.switchCalls).toBe(2);
  });

  it('single-flights concurrent renewals', async () => {
    const { provider, world } = setup();
    await provider.login?.(creds, ctx);
    world.now += 15 * 60_000 - 30_000;
    const tokens = await Promise.all([1, 2, 3, 4, 5].map(() => provider.getToken()));
    expect(new Set(tokens)).toEqual(new Set(['org-2']));
    expect(world.switchCalls).toBe(2);
  });

  it('refreshes the base token before re-switching when it expired', async () => {
    const { provider, world, store } = setup();
    await provider.login?.(creds, ctx);
    world.now += 16 * 60_000;
    expect(await provider.getToken()).toBe('org-2');
    expect(world.refreshCalls).toBe(1);
    expect(store.snapshot().base?.accessToken).toBe('base-s2');
    expect(world.calls.slice(-2)).toEqual(['http://auth/v1/token', 'http://hasura/v1/graphql']);
  });

  it('single-flights the base refresh across getIdentity and getToken', async () => {
    const { provider, world, store, make } = setup();
    await provider.login?.(creds, ctx);
    const reloaded = make(); // a page reload: memberships are not cached yet
    world.now += 16 * 60_000;
    world.holdRefresh = Promise.resolve();
    const [identity, token] = await Promise.all([reloaded.getIdentity(ctx), reloaded.getToken()]);
    expect(world.refreshCalls).toBe(1);
    expect(identity?.organizationId).toBe(NOVA);
    expect(token).toBe('org-2');
    expect(store.snapshot().base).not.toBeNull();
  });

  it('keeps a newer organization when a slower renewal finishes', async () => {
    const { provider, world, store } = setup();
    await provider.login?.(creds, ctx);
    world.now += 15 * 60_000 - 30_000;
    let release = (): void => undefined;
    world.holdSwitch = new Promise<void>((resolve) => {
      release = resolve;
    });
    const renewing = provider.getToken();
    await new Promise((r) => setTimeout(r, 0));
    expect(await provider.switchOrganization(RIVER)).toEqual({ success: true });
    release();
    await renewing;
    expect(store.snapshot().org?.organizationId).toBe(RIVER);
  });

  it('stays signed out when logout happens during a refresh', async () => {
    const { provider, world, store } = setup();
    await provider.login?.(creds, ctx);
    world.now += 16 * 60_000;
    let release = (): void => undefined;
    world.holdRefresh = new Promise<void>((resolve) => {
      release = resolve;
    });
    const renewing = provider.getToken();
    await new Promise((r) => setTimeout(r, 0));
    await provider.logout?.(undefined, ctx);
    release();
    expect(await renewing).toBeNull();
    expect(store.snapshot()).toEqual({ base: null, org: null });
  });

  it('refreshes after an auth error from the data layer', async () => {
    const { provider, world } = setup();
    await provider.login?.(creds, ctx);
    const error: DataError = { kind: 'auth', code: 'invalid-jwt', message: 'expired' };
    expect(await provider.onError?.(error, ctx)).toEqual({ action: 'refreshed' });
    expect(world.switchCalls).toBe(2);
  });

  it('signs out when the refresh token is rejected', async () => {
    const { provider, world, store } = setup();
    await provider.login?.(creds, ctx);
    world.now += 16 * 60_000;
    world.refreshRejected = true;
    const error: DataError = { kind: 'auth', code: 'invalid-jwt', message: 'expired' };
    expect(await provider.onError?.(error, ctx)).toEqual({ action: 'logout' });
    expect(store.snapshot()).toEqual({ base: null, org: null });
    expect(await provider.check(ctx)).toEqual({ authenticated: false, reason: 'signed-out' });
  });

  it('keeps the current organization when a switch is refused', async () => {
    const { provider, world, store } = setup();
    await provider.login?.(creds, ctx);
    const before = store.snapshot();
    world.switchFailure = { code: 'membership_inactive', message: 'Your membership in this organization is not active' };
    const result = await provider.switchOrganization(RIVER);
    expect(result).toMatchObject({
      success: false,
      error: { kind: 'forbidden', code: 'membership_inactive', message: 'Your membership in this organization is not active' },
    });
    expect(store.snapshot()).toEqual(before);
  });

  it('switches organization on success', async () => {
    const { provider, store } = setup();
    await provider.login?.(creds, ctx);
    expect(await provider.switchOrganization(RIVER)).toEqual({ success: true });
    expect(store.snapshot().org?.organizationId).toBe(RIVER);
  });

  it('propagates non-auth errors', async () => {
    const { provider } = setup();
    const error: DataError = { kind: 'validation', code: 'bad', message: 'nope' };
    expect(await provider.onError?.(error, ctx)).toEqual({ action: 'propagate', error });
  });

  it('logout clears the store', async () => {
    const { provider, store } = setup();
    await provider.login?.(creds, ctx);
    expect(await provider.logout?.(undefined, ctx)).toEqual({ success: true });
    expect(store.snapshot()).toEqual({ base: null, org: null });
  });
});
