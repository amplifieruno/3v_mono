import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { authorizationHeader } from '../../src/auth-service/signature.js';
import { HasuraError } from '../../src/hasura/client.js';
import { bind } from './support/authDecide.js';
import { BASE, call, openSession, restWorld, rotateKey, stable, type RestWorld } from './support/authRest.js';
import { createApp } from './support/authService.js';
import { asUser } from './support/clients.js';
import { createTestUser, expectDenied } from './support/fixtures.js';
import { callFn } from './support/operations.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Key auth of /v1/auth/* and the rotate_client_key action. */

let w: RestWorld;

beforeAll(async () => {
  await requireBackend();
  w = await restWorld();
}, 120_000);

const sessions = (key: { prefix: string; secret: string }, tweak: Parameters<typeof call>[4] = {}) =>
  call(key, 'POST', '/v1/auth/sessions', { mode: 'identification', device_ref: 'k1' }, tweak);

describe('rotate_client_key', () => {
  it('should return the plaintext secret once and keep only hash + ciphertext (never selectable)', async () => {
    const key = await rotateKey(w.a, w.app.id);
    expect(key.prefix).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(key.secret.length).toBeGreaterThanOrEqual(40);
    const [row] = await runSqlRows(`select secret_hash, secret from itap.client_application_keys where id = '${key.key_id}'`);
    expect(row.secret_hash).toMatch(/^scrypt\$/);
    expect(row.secret).toMatch(/^v1:/);
    expect(row.secret).not.toContain(key.secret);
    await expectDenied(w.a.request(`query { client_application_keys { secret } }`), 'secret');
    const [audit] = await runSqlRows(
      `select changes::text as c from itap.audit_log where entity = 'client_application_keys' and entity_id = '${key.key_id}'`,
    );
    expect(audit.c).not.toContain(key.secret);
    expect(audit.c).not.toContain(String(row.secret));
    // Two active keys at most (rotation overlap): the world key + this one.
    const limit = await rotateKey(w.a, w.app.id).catch((e: unknown) => e);
    expect(limit).toBeInstanceOf(HasuraError);
    expect((limit as HasuraError).code).toBe('client_key_limit');
  });

  it('should be refused to a non-admin role', async () => {
    const user = await createTestUser();
    await expect(
      asUser(user.id).request(`mutation($a: uuid!) { rotate_client_key(application_id: $a) { secret } }`, { a: w.app.id }),
    ).rejects.toThrow();
  });
});

describe('ITAP-HMAC key auth', () => {
  it('should accept a signed request and update last_used_at', async () => {
    const reply = await sessions(w.key);
    expect(reply.status, JSON.stringify(reply.body)).toBe(201);
    expect(reply.body.nonce).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    const [row] = await runSqlRows(`select last_used_at from itap.client_application_keys where id = '${w.key.key_id}'`);
    expect(row.last_used_at).not.toBe('NULL');
  });

  it('should answer a bad signature and an unknown key with the same 401', async () => {
    const bad = await sessions(w.key, { secret: 'wrong-secret' });
    const unknown = await sessions(w.key, { prefix: 'ZZZZ9999' });
    const missing = await call(null, 'POST', '/v1/auth/sessions', { mode: 'identification', device_ref: 'k1' });
    for (const reply of [bad, unknown, missing]) {
      expect(reply.status).toBe(401);
      expect(stable(reply.body)).toEqual(stable(bad.body));
      expect(reply.body.error?.code).toBe('unauthorized');
    }
  });

  it('should refuse a timestamp outside ±300 s', async () => {
    const old = await sessions(w.key, { ts: Math.floor(Date.now() / 1000) - 301 });
    expect(old.status).toBe(401);
    expect(old.body.error?.code).toBe('timestamp_skew');
    const ahead = await sessions(w.key, { ts: Math.floor(Date.now() / 1000) + 301 });
    expect(ahead.body.error?.code).toBe('timestamp_skew');
    expect((await sessions(w.key, { ts: Math.floor(Date.now() / 1000) - 250 })).status).toBe(201);
  });

  it('should refuse a tampered body (the signature covers the raw body)', async () => {
    const signed = Buffer.from('{"mode":"identification","device_ref":"k1"}');
    const ts = Math.floor(Date.now() / 1000);
    const res = await fetch(`${BASE}/v1/auth/sessions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: authorizationHeader(w.key.prefix, w.key.secret, 'POST', '/v1/auth/sessions', signed, ts),
      },
      body: '{"mode":"verification","device_ref":"k1"}',
    });
    expect(res.status).toBe(401);
  });

  it('should refuse a revoked key', async () => {
    const app = await createApp(w.a);
    await bind(w.org, app.id, { segments: [w.segment.id], modes: ['identification'] });
    const key = await rotateKey(w.a, app.id);
    expect((await sessions(key)).status).toBe(201);
    await callFn(w.a, 'revoke_client_key', { p_key: key.key_id }, 'id');
    const reply = await sessions(key);
    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe('key_revoked');
  });

  it('should refuse every request of a suspended application', async () => {
    const session = await openSession(w.key);
    await runSql(`update itap.client_applications set status = 'suspended' where id = '${w.app.id}'`);
    try {
      const reply = await sessions(w.key);
      expect(reply.status).toBe(403);
      expect(reply.body.error?.code).toBe('application_inactive');
      expect((await call(w.key, 'GET', `/v1/auth/sessions/${session.session_id}`)).status).toBe(403);
    } finally {
      await runSql(`update itap.client_applications set status = 'active' where id = '${w.app.id}'`);
    }
  });

  it('should validate the session request (mode allowed, access point bound)', async () => {
    const bad = await call(w.key, 'POST', '/v1/auth/sessions', { mode: 'identification', device_ref: 'k1', access_point_id: w.door.id });
    expect(bad.status).toBe(403);
    expect(bad.body.error?.code).toBe('access_point_not_bound');
    const invalid = await call(w.key, 'POST', '/v1/auth/sessions', { mode: 'other', device_ref: 'k1' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error?.code).toBe('invalid_request');
  });
});
