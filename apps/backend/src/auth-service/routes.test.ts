import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import type { InsightFaceBatchClient } from '../face/insightFaceClient.js';
import type { StorageClient } from '../storage/storageClient.js';
import { encryptSecret, serverKeys } from './crypto.js';
import { AUTH_ROUTES, openApiDocument } from './openapi/document.js';
import { SERVICE_ERROR_CODES } from './openapi/schemas.js';
import { TokenBuckets } from './rateLimit.js';
import { authServiceRouter, type AuthServiceDeps } from './routes.js';
import { authorizationHeader } from './signature.js';
import type { AuthStore, KeyRecord } from './store.js';

const keys = serverKeys('d'.repeat(64));
const NOW = 1_800_000_000_000;
let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

function keyRecord(extra: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k1', organization_id: 'o1', application_id: 'a1', secret: encryptSecret(keys, 'top-secret', 'Abcd1234'),
    expires_at: null, revoked_at: null, last_used_at: null, application: { status: 'active', is_sandbox: false }, ...extra,
  };
}

function fakeStore(key: KeyRecord | undefined, ping: () => Promise<void> = async () => undefined): AuthStore {
  return {
    keyByPrefix: async () => key,
    touchKey: async () => undefined,
    ping,
    session: async () => undefined,
    sessionState: async () => undefined,
  } as unknown as AuthStore;
}

async function start(partial: Partial<AuthServiceDeps>): Promise<string> {
  const deps: AuthServiceDeps = {
    store: fakeStore(keyRecord()),
    storage: {} as StorageClient,
    insightFace: { health: async () => true } as unknown as InsightFaceBatchClient,
    keys,
    now: () => NOW,
    ...partial,
  };
  const app = express();
  app.use('/v1/auth', authServiceRouter(deps));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const ts = Math.floor(NOW / 1000);
const get = (base: string, path: string, auth?: string) => fetch(`${base}${path}`, { headers: auth ? { authorization: auth } : {} });
const signedGet = (path: string, secret = 'top-secret', at = ts) => authorizationHeader('Abcd1234', secret, 'GET', path, Buffer.alloc(0), at);

describe('key auth middleware', () => {
  it('should pass a valid signature (unknown session → 404) and refuse bad signatures and skew', async () => {
    const base = await start({});
    const path = '/v1/auth/sessions/0f8fad5b-d9cb-469f-a165-70867728950e';
    expect((await get(base, path, signedGet(path))).status).toBe(404);
    const bad = await get(base, path, signedGet(path, 'other'));
    expect(bad.status).toBe(401);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('unauthorized');
    const skew = await get(base, path, signedGet(path, 'top-secret', ts - 301));
    expect(((await skew.json()) as { error: { code: string } }).error.code).toBe('timestamp_skew');
  });

  it('should refuse revoked and expired keys, suspended applications and undecryptable secrets', async () => {
    const path = '/v1/auth/sessions/0f8fad5b-d9cb-469f-a165-70867728950e';
    const cases: [Partial<KeyRecord>, number, string][] = [
      [{ revoked_at: '2020-01-01T00:00:00Z' }, 401, 'key_revoked'],
      [{ expires_at: new Date(NOW - 1000).toISOString() }, 401, 'key_expired'],
      [{ application: { status: 'suspended', is_sandbox: false } }, 403, 'application_inactive'],
      [{ secret: encryptSecret(serverKeys('e'.repeat(64)), 'top-secret', 'Abcd1234') }, 401, 'unauthorized'],
      [{ secret: null }, 401, 'unauthorized'],
    ];
    for (const [extra, status, code] of cases) {
      const base = await start({ store: fakeStore(keyRecord(extra)) });
      const res = await get(base, path, signedGet(path));
      expect(res.status, code).toBe(status);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(code);
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it('should rate limit per key with a retryable 429', async () => {
    const base = await start({ buckets: new TokenBuckets(1, 0.001, () => NOW) });
    const path = '/v1/auth/sessions/0f8fad5b-d9cb-469f-a165-70867728950e';
    expect((await get(base, path, signedGet(path))).status).toBe(404);
    const limited = await get(base, `${path}?n=2`, signedGet(`${path}?n=2`));
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).not.toBeNull();
    expect(((await limited.json()) as { error: { retryable: boolean } }).error.retryable).toBe(true);
  });

  it('should answer 503 for keyed routes when the service key is not configured', async () => {
    const base = await start({ keys: undefined });
    const res = await get(base, '/v1/auth/sessions/x', signedGet('/v1/auth/sessions/x'));
    expect(res.status).toBe(503);
  });
});

describe('request hygiene', () => {
  const path = '/v1/auth/sessions/0f8fad5b-d9cb-469f-a165-70867728950e';

  it('should refuse a replayed signature with replayed_request', async () => {
    const base = await start({});
    const header = signedGet(path);
    expect((await get(base, path, header)).status).toBe(404);
    const again = await get(base, path, header);
    expect(again.status).toBe(401);
    expect(((await again.json()) as { error: { code: string } }).error.code).toBe('replayed_request');
  });

  it('should answer 401 to a missing or malformed header before reading the body', async () => {
    let reads = 0;
    const store = { ...fakeStore(keyRecord()), keyByPrefix: async () => { reads += 1; return keyRecord(); } } as unknown as AuthStore;
    const base = await start({ store });
    for (const authorization of [undefined, 'ITAP-HMAC nonsense']) {
      const res = await fetch(`${base}/v1/auth/authenticate`, {
        method: 'POST',
        headers: authorization ? { authorization } : {},
        body: Buffer.alloc(9 * 1024 * 1024, 0x61),
      });
      expect(res.status).toBe(401);
    }
    expect(reads).toBe(0);
  });

  it('should map body-parser client errors to 400 invalid_request', async () => {
    const base = await start({});
    const body = Buffer.from('{}');
    const res = await fetch(`${base}/v1/auth/authenticate`, {
      method: 'POST',
      headers: {
        'content-encoding': 'bogus',
        authorization: authorizationHeader('Abcd1234', 'top-secret', 'POST', '/v1/auth/authenticate', body, ts),
      },
      body,
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('invalid_request');
  });

  it('should echo a signed X-Request-Id when it is a uuid', async () => {
    const base = await start({});
    const id = '6a2f41a3-c54c-4fd2-a1c2-0c5c1b4f1e11';
    const authorization = authorizationHeader('Abcd1234', 'top-secret', 'GET', path, Buffer.alloc(0), ts, id);
    const res = await fetch(`${base}${path}`, { headers: { authorization, 'x-request-id': id } });
    expect(res.status).toBe(404);
    expect(((await res.json()) as { request_id: string }).request_id).toBe(id);
  });
});

describe('health', () => {
  it('should report degradation as a retryable 503', async () => {
    const base = await start({ store: fakeStore(keyRecord(), async () => { throw new Error('db down'); }) });
    const res = await get(base, '/v1/auth/health');
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'degraded', checks: { database: 'unavailable', face_service: 'ok' }, error: { retryable: true } });
    const faceDown = await start({ insightFace: { health: async () => false } as unknown as InsightFaceBatchClient });
    expect((await get(faceDown, '/v1/auth/health')).status).toBe(503);
  });
});

describe('OpenAPI document', () => {
  type Operation = { responses: Record<string, unknown>; security?: unknown[] };
  const doc = openApiDocument();
  const paths = doc.paths as unknown as Record<string, Record<string, Operation>>;

  it('should be a JSON-serializable OpenAPI 3.1 document whose local refs resolve', () => {
    const parsed = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
    expect(parsed.openapi).toBe('3.1.0');
    const refs = JSON.stringify(doc).match(/"\$ref":"#\/[^"]+"/g) ?? [];
    expect(refs.length).toBeGreaterThan(5);
    for (const ref of refs) {
      const pointer = ref.slice(10, -1).split('/');
      let node: unknown = parsed;
      for (const part of pointer) node = (node as Record<string, unknown>)?.[part];
      expect(node, ref).toBeDefined();
    }
  });

  it('should document every route of the router and nothing else', async () => {
    const router = authServiceRouter({ store: fakeStore(undefined), storage: {} as StorageClient, insightFace: {} as InsightFaceBatchClient, keys });
    const stack = (router as unknown as { stack: { route?: { path: string; methods: Record<string, boolean> } }[] }).stack;
    const routed = stack
      .filter((layer) => layer.route)
      .flatMap((layer) => Object.keys(layer.route?.methods ?? {}).map((m) => `${m} /v1/auth${layer.route?.path.replace(/:(\w+)/g, '{$1}')}`))
      .sort();
    const documented = Object.entries(paths).flatMap(([path, ops]) => Object.keys(ops).map((m) => `${m} ${path}`)).sort();
    expect(documented).toEqual(routed);
    expect(AUTH_ROUTES.map((r) => `${r.method} ${r.path}`).sort()).toEqual(routed);
  });

  it('should document the response codes each route can answer', () => {
    const keyedCodes = ['401', '403', '429', '500', '503'];
    const expected: Record<string, string[]> = {
      'post /v1/auth/sessions': ['201', '400', ...keyedCodes],
      'post /v1/auth/authenticate': ['200', '400', '404', '409', '413', '504', ...keyedCodes],
      'post /v1/auth/sessions/{id}/recapture': ['200', '400', '404', '409', '413', '504', ...keyedCodes],
      'post /v1/auth/sessions/{id}/second-factor': ['200', '400', '404', '409', ...keyedCodes],
      'get /v1/auth/sessions/{id}': ['200', '404', ...keyedCodes],
      'get /v1/auth/health': ['200', '503'],
      'get /v1/auth/openapi.json': ['200'],
    };
    for (const route of AUTH_ROUTES) {
      const op = paths[route.path][route.method];
      expect(Object.keys(op.responses).sort(), route.path).toEqual(expected[`${route.method} ${route.path}`].sort());
      expect(op.security === undefined, route.path).toBe(route.keyed);
    }
  });

  it('should describe request ids, Retry-After, required guidance and the session id of errors', () => {
    const schemas = doc.components.schemas as Record<string, { required?: string[]; properties?: Record<string, { required?: string[] }> }>;
    expect(schemas.Error.properties?.error.required).toContain('guidance');
    expect(Object.keys(schemas.Error.properties ?? {})).toContain('session_id');
    for (const route of AUTH_ROUTES.filter((r) => r.keyed)) {
      const op = paths[route.path][route.method] as Operation & { parameters?: { $ref?: string }[]; responses: Record<string, { headers?: Record<string, unknown> }> };
      expect(op.parameters?.some((p) => p.$ref === '#/components/parameters/RequestId'), route.path).toBe(true);
      expect(Object.keys(op.responses['429'].headers ?? {}), route.path).toContain('Retry-After');
    }
  });

  it('should list every service error code the service can answer', async () => {
    const sources = await Promise.all(['errors.ts', 'routes.ts', 'keyAuth.ts', 'frames.ts', 'pipeline.ts'].map(async (f) =>
      (await import('node:fs/promises')).readFile(new URL(`./${f}`, import.meta.url), 'utf8')));
    const used = new Set<string>();
    for (const source of sources) {
      for (const m of source.matchAll(/new ServiceError\(\s*\d{3},\s*'([a-z_]+)'/g)) used.add(m[1]);
    }
    used.add('unauthorized');
    used.add('service_degraded');
    expect([...used].filter((code) => !(SERVICE_ERROR_CODES as readonly string[]).includes(code))).toEqual([]);
  });
});
