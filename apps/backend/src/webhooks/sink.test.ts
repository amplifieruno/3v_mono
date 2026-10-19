import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import type { Env } from '../config/env.js';

const env = {
  HASURA_GRAPHQL_URL: 'http://hasura.test/v1/graphql',
  GRAPHQL_ADMIN_SECRET: 'admin-secret',
  HASURA_JWT_SECRET: { type: 'HS256', key: 'k'.repeat(32), issuer: 'hasura-auth' },
  ACTION_SECRET: 'action-secret',
  NHOST_STORAGE_URL: 'http://storage.test',
  INSIGHTFACE_API_URL: 'http://insightface.test',
  STREAM_SERVER_URL: 'http://stream-server.test:8888',
  ORG_TOKEN_TTL_SECONDS: 900,
} as Env;

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function start(sinkEnabled: boolean): Promise<string> {
  server = createApp({ ...env, WEBHOOK_SINK_ENABLED: sinkEnabled }).listen(0);
  await new Promise<void>((resolve) => server?.once('listening', () => resolve()));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/hasura/events/webhook-sink`;
}

const post = (url: string, body: string) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-itap-delivery': 'd-1' }, body });

describe('webhook sink', () => {
  it('should not exist unless WEBHOOK_SINK_ENABLED (the events router demands its secret)', async () => {
    const url = await start(false);
    expect((await post(url, '{}')).status).toBe(401);
    expect((await post(`${url}/500`, '{}')).status).toBe(401);
    expect((await fetch(url, { headers: { 'x-action-secret': 'action-secret' } })).status).toBe(404);
  });

  it('should answer with the requested status and keep the raw body and headers for the secret holder', async () => {
    const url = await start(true);
    expect((await post(url, '{"a": 1}')).status).toBe(200);
    expect((await post(`${url}/503`, 'raw')).status).toBe(503);
    expect((await post(`${url}/99`, 'x')).status).toBe(400);
    expect((await fetch(url)).status).toBe(401);
    const res = await fetch(url, { headers: { 'x-action-secret': 'action-secret' } });
    const { requests } = (await res.json()) as { requests: { status: number; body: string; headers: Record<string, string> }[] };
    expect(requests.map((r) => [r.status, r.body])).toEqual([[200, '{"a": 1}'], [503, 'raw']]);
    expect(requests[0].headers['x-itap-delivery']).toBe('d-1');
  });
});
