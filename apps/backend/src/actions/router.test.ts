import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import { ActionError, actionsRouter, type ActionHandler } from './router.js';

const env: Env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action-secret',
  NHOST_STORAGE_URL: 'http://storage.test',
  ORG_TOKEN_TTL_SECONDS: 900,
};

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(handlers: Record<string, ActionHandler<unknown, unknown>>): Promise<string> {
  const app = express();
  app.use('/hasura/actions', actionsRouter(env, handlers));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/hasura/actions`;
}

function payload(name: string, input: unknown = {}, session: Record<string, string> = {}) {
  return JSON.stringify({
    action: { name },
    input,
    session_variables: { 'x-hasura-role': 'user', 'x-hasura-user-id': 'u-1', ...session },
  });
}

async function call(url: string, body: string, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['x-action-secret'] = secret;
  const res = await fetch(url, { method: 'POST', headers, body });
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('actionsRouter', () => {
  it('should reject a missing x-action-secret with 401 without calling the handler', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const url = await start({ ping: handler });
    const res = await call(`${url}/ping`, payload('ping'));
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ message: 'Unauthorized', extensions: { code: 'unauthorized' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should reject a wrong x-action-secret with 401 before parsing the body', async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const url = await start({ ping: handler });
    const res = await call(`${url}/ping`, '{not json', 'wrong-secret');
    expect(res.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('should return 404 for an unknown action', async () => {
    const url = await start({ ping: vi.fn(async () => ({})) });
    const res = await call(`${url}/nope`, payload('nope'), env.ACTION_SECRET);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ message: 'Unknown action: nope', extensions: { code: 'not_found' } });
  });

  it('should map ActionError to HTTP 400 in the Hasura action error format', async () => {
    const url = await start({
      ping: async () => {
        throw new ActionError('x', 'm');
      },
    });
    const res = await call(`${url}/ping`, payload('ping'), env.ACTION_SECRET);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: 'm', extensions: { code: 'x' } });
  });

  it('should pass input and the session built from session_variables to the handler', async () => {
    const handler = vi.fn(async (ctx: Parameters<ActionHandler<unknown, unknown>>[0]) => ({
      input: ctx.input,
      session: ctx.session,
    }));
    const url = await start({ ping: handler });
    const res = await call(
      `${url}/ping`,
      payload('ping', { a: 1 }, { 'x-hasura-role': 'org_admin', 'x-hasura-organization-id': 'o-1' }),
      env.ACTION_SECRET,
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      input: { a: 1 },
      session: { role: 'org_admin', userId: 'u-1', organizationId: 'o-1' },
    });
  });

  it('should reject a malformed payload with 400 invalid_payload', async () => {
    const handler = vi.fn(async () => ({}));
    const url = await start({ ping: handler });
    const res = await call(`${url}/ping`, JSON.stringify({ input: {} }), env.ACTION_SECRET);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ extensions: { code: 'invalid_payload' } });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should map unexpected errors to 500 without leaking details', async () => {
    const url = await start({
      ping: async () => {
        throw new Error('secret internals');
      },
    });
    const res = await call(`${url}/ping`, payload('ping'), env.ACTION_SECRET);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ message: 'Internal error', extensions: { code: 'internal' } });
  });
});
