import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import {
  defaultEventHandlers,
  defineCronHandler,
  defineEventHandler,
  eventsRouter,
  idempotencyKey,
  type CronTriggerPayload,
  type EventHandlers,
  type EventTriggerPayload,
  type TriggerContext,
} from './router.js';

const env: Env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action-secret',
  NHOST_STORAGE_URL: 'http://storage.test',
  INSIGHTFACE_API_URL: 'http://insightface.test',
  STREAM_SERVER_URL: 'http://stream-server.test:8888',
  ORG_TOKEN_TTL_SECONDS: 900,
};

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(handlers: EventHandlers): Promise<string> {
  const app = express();
  app.use('/hasura/events', eventsRouter(env, handlers));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}/hasura/events`;
}

const eventPayload = (name: string, op = 'INSERT') => ({
  id: 'evt-1',
  created_at: '2026-10-19T10:00:00Z',
  trigger: { name },
  table: { schema: 'itap', name: 'reports' },
  delivery_info: { max_retries: 3, current_retry: 1 },
  event: {
    op,
    session_variables: { 'x-hasura-role': 'org_admin', 'x-hasura-user-id': 'u-1' },
    data: { old: null, new: { id: 'r-1', organization_id: 'o-1' } },
  },
});
const cronPayload = (name: string) => ({
  id: 'cron-1',
  name,
  scheduled_time: '2026-10-19T10:05:00Z',
  payload: { scope: 'all' },
  comment: null,
});

async function call(url: string, body: unknown, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['x-action-secret'] = secret;
  const res = await fetch(url, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as unknown };
}

describe('eventsRouter', () => {
  it('should reject a missing or wrong x-action-secret with 401 before parsing the body', async () => {
    const handle = vi.fn(async () => ({}));
    const url = await start({ heartbeat: defineCronHandler(handle) });
    expect((await call(`${url}/heartbeat`, cronPayload('heartbeat'))).status).toBe(401);
    const wrong = await call(`${url}/heartbeat`, '{not json', 'wrong');
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual({ message: 'Unauthorized', extensions: { code: 'unauthorized' } });
    expect(handle).not.toHaveBeenCalled();
  });

  it('should return 404 for an unknown trigger', async () => {
    const url = await start({});
    const res = await call(`${url}/nope`, cronPayload('nope'), env.ACTION_SECRET);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, error: 'unknown_trigger', message: 'Unknown trigger: nope' });
  });

  it('should pass a typed cron payload to a cron handler and answer { ok: true, ...result }', async () => {
    const handle = vi.fn(async (payload: CronTriggerPayload) => ({
      scheduled: payload.scheduled_time,
      input: payload.payload,
    }));
    const url = await start({ tick: defineCronHandler(handle) });
    const res = await call(`${url}/tick`, cronPayload('tick'), env.ACTION_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, scheduled: '2026-10-19T10:05:00Z', input: { scope: 'all' } });
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('should pass a typed event payload and context to an event handler', async () => {
    const handle = vi.fn(async (payload: EventTriggerPayload, ctx: TriggerContext) => ({
      op: payload.event.op,
      row: payload.event.data.new,
      key: ctx.idempotencyKey,
    }));
    const url = await start({ render_report: defineEventHandler(handle) });
    const res = await call(`${url}/render_report`, eventPayload('render_report'), env.ACTION_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      op: 'INSERT',
      row: { id: 'r-1', organization_id: 'o-1' },
      key: 'render_report:evt-1',
    });
  });

  it('should answer { ok: true } when a handler returns nothing', async () => {
    const url = await start({ tick: defineCronHandler(async () => undefined) });
    const res = await call(`${url}/tick`, cronPayload('tick'), env.ACTION_SECRET);
    expect(res.body).toEqual({ ok: true });
  });

  it.each([
    ['a cron payload sent to an event handler', 'evt', cronPayload('evt')],
    ['an event payload sent to a cron handler', 'tick', eventPayload('tick')],
    ['a payload naming another trigger', 'tick', cronPayload('other')],
    ['a payload with an unknown op', 'evt', eventPayload('evt', 'TRUNCATE')],
    ['a payload missing its id', 'tick', { name: 'tick', scheduled_time: 'x', payload: {} }],
  ])('should reject %s with 400 invalid_payload without calling the handler', async (_label, name, body) => {
    const handle = vi.fn(async () => ({}));
    const url = await start({ evt: defineEventHandler(handle), tick: defineCronHandler(handle) });
    const res = await call(`${url}/${name}`, body, env.ACTION_SECRET);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'invalid_payload' });
    expect(handle).not.toHaveBeenCalled();
  });

  it('should reject malformed JSON from an authenticated caller with 400', async () => {
    const url = await start({ tick: defineCronHandler(async () => undefined) });
    const res = await call(`${url}/tick`, '{not json', env.ACTION_SECRET);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ ok: false, error: 'invalid_payload' });
  });

  it('should map handler errors to HTTP 500 (Hasura retries) without leaking details', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const url = await start({
      tick: defineCronHandler(async () => {
        throw new Error('secret internals');
      }),
    });
    const res = await call(`${url}/tick`, cronPayload('tick'), env.ACTION_SECRET);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ ok: false, error: 'internal', message: 'Internal error' });
    expect(logged).toHaveBeenCalledTimes(1);
    logged.mockRestore();
  });

  it('should register the heartbeat cron by default, answering ok without side effects', async () => {
    const url = await start(defaultEventHandlers);
    const res = await call(`${url}/heartbeat`, cronPayload('heartbeat'), env.ACTION_SECRET);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, scheduled_time: '2026-10-19T10:05:00Z' });
  });
});

describe('idempotencyKey', () => {
  it('should be stable across Hasura retries of the same delivery (trigger name + event id)', () => {
    expect(idempotencyKey('send_webhook', 'e-9')).toBe('send_webhook:e-9');
    expect(idempotencyKey('heartbeat', 'c-1')).toBe('heartbeat:c-1');
  });
});
