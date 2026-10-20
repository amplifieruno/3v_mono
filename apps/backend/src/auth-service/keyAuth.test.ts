import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { encryptSecret, serverKeys } from './crypto.js';
import { ReplayCache, requireClientKey } from './keyAuth.js';
import { TokenBuckets } from './rateLimit.js';
import { authorizationHeader, MAX_SKEW_SECONDS } from './signature.js';
import type { AuthStore, KeyRecord } from './store.js';

const keys = serverKeys('d'.repeat(64));
const PATH = '/v1/auth/ping';
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

const keyRecord = (extra: Partial<KeyRecord> = {}): KeyRecord => ({
  id: 'k1', organization_id: 'o1', application_id: 'a1', secret: encryptSecret(keys, 'top-secret', 'Abcd1234'),
  expires_at: null, revoked_at: null, last_used_at: null, application: { status: 'active', is_sandbox: false }, ...extra,
});

async function start(clock: { now: number }, key: () => KeyRecord | undefined, buckets?: TokenBuckets): Promise<string> {
  const store = { keyByPrefix: async () => key(), touchKey: async () => undefined } as unknown as AuthStore;
  const app = express();
  app.use(express.raw({ type: '*/*' }));
  app.get(PATH, requireClientKey({ store, keys, now: () => clock.now, buckets: buckets ?? new TokenBuckets(30, 10, () => clock.now) }), (_req, res) => {
    res.status(204).end();
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}${PATH}`;
}

const signed = (ts: number) => authorizationHeader('Abcd1234', 'top-secret', 'GET', PATH, Buffer.alloc(0), ts);
const call = async (url: string, authorization: string) => {
  const res = await fetch(url, { headers: { authorization } });
  const body = res.status === 204 ? undefined : ((await res.json()) as { error: { code: string; retryable: boolean } });
  return { status: res.status, error: body?.error };
};

describe('ReplayCache', () => {
  it('should remember a signature until its own expiry and accept it again afterwards', () => {
    const cache = new ReplayCache();
    expect(cache.seen('a', 1_000)).toBe(false);
    cache.record('a', 5_000);
    expect(cache.seen('a', 4_999)).toBe(true);
    expect(cache.seen('a', 5_000)).toBe(false);
  });
});

describe('requireClientKey: final review ordering', () => {
  it('should mark timestamp_skew retryable', async () => {
    const clock = { now: 1_800_000_000_000 };
    const url = await start(clock, () => keyRecord());
    const reply = await call(url, signed(clock.now / 1000 - MAX_SKEW_SECONDS - 1));
    expect(reply.error).toMatchObject({ code: 'timestamp_skew', retryable: true });
  });

  it('should keep a signature in the replay cache until ts + skew + 1 s', async () => {
    const clock = { now: 1_800_000_000_000 };
    const ts = clock.now / 1000;
    const replays = new ReplayCache();
    const store = { keyByPrefix: async () => keyRecord(), touchKey: async () => undefined } as unknown as AuthStore;
    const app = express();
    app.get(PATH, requireClientKey({ store, keys, replays, now: () => clock.now, buckets: new TokenBuckets(30, 10, () => clock.now) }), (_q, r) => {
      r.status(204).end();
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}${PATH}`;
    expect((await call(url, signed(ts))).status).toBe(204);
    const header = /sig=([0-9a-f]+)/.exec(signed(ts))?.[1];
    expect(replays.seen(`Abcd1234:${header}`, (ts + MAX_SKEW_SECONDS) * 1000)).toBe(true);
    expect(replays.seen(`Abcd1234:${header}`, (ts + MAX_SKEW_SECONDS + 1) * 1000)).toBe(false);
  });

  it('should not consume a signature refused by the rate limit', async () => {
    const clock = { now: 1_800_000_000_000 };
    const url = await start(clock, () => keyRecord(), new TokenBuckets(1, 1, () => clock.now));
    const ts = clock.now / 1000;
    expect((await call(url, signed(ts - 1))).status).toBe(204);
    const header = signed(ts);
    expect((await call(url, header)).status).toBe(429);
    clock.now += 2_000;
    expect((await call(url, header)).status).toBe(204);
    expect((await call(url, header)).error?.code).toBe('replayed_request');
  });

  it('should not consume a signature refused for an inactive application', async () => {
    const clock = { now: 1_800_000_000_000 };
    let status = 'suspended';
    const url = await start(clock, () => keyRecord({ application: { status, is_sandbox: false } }));
    const header = signed(clock.now / 1000);
    expect((await call(url, header)).error?.code).toBe('application_inactive');
    status = 'active';
    expect((await call(url, header)).status).toBe(204);
  });

  it('should answer key_revoked for a revoked key whose ciphertext was cleared', async () => {
    const clock = { now: 1_800_000_000_000 };
    const url = await start(clock, () => keyRecord({ revoked_at: '2026-01-01T00:00:00Z', secret: null }));
    expect((await call(url, signed(clock.now / 1000))).error?.code).toBe('key_revoked');
  });
});
