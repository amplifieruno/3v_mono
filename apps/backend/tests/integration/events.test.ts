import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { testEnv } from './support/clients.js';

const backendUrl = `http://localhost:${process.env.BACKEND_PORT ?? 3001}/hasura/events`;

async function post(path: string, body: unknown, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['x-action-secret'] = secret;
  const res = await fetch(`${backendUrl}/${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, body: (await res.json()) as unknown };
}

type CronTrigger = {
  name: string;
  webhook: string;
  schedule: string;
  include_in_metadata: boolean;
  headers: { name: string; value_from_env?: string }[];
  retry_conf: { num_retries: number; retry_interval_seconds: number; timeout_seconds: number; tolerance_seconds?: number };
};

async function exportedCronTriggers(): Promise<CronTrigger[]> {
  const env = testEnv();
  const res = await fetch(new URL('/v1/metadata', env.HASURA_GRAPHQL_URL).toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': env.GRAPHQL_ADMIN_SECRET },
    body: JSON.stringify({ type: 'export_metadata', version: 2, args: {} }),
  });
  if (!res.ok) throw new Error(`export_metadata failed: ${await res.text()}`);
  const body = (await res.json()) as { metadata: { cron_triggers?: CronTrigger[] } };
  return body.metadata.cron_triggers ?? [];
}

const cronPayload = { id: crypto.randomUUID(), name: 'heartbeat', scheduled_time: new Date().toISOString(), payload: {} };

describe('Hasura event/cron trigger wiring', () => {
  beforeAll(requireBackend);

  it('should answer the heartbeat cron delivery with ok when the secret is valid', async () => {
    const res = await post('heartbeat', cronPayload, testEnv().ACTION_SECRET);
    expect(res).toEqual({ status: 200, body: { ok: true, scheduled_time: cronPayload.scheduled_time } });
  });

  it('should reject a delivery without the secret and an unknown trigger', async () => {
    expect((await post('heartbeat', cronPayload)).status).toBe(401);
    expect((await post('no_such_trigger', { ...cronPayload, name: 'no_such_trigger' }, testEnv().ACTION_SECRET)).status).toBe(404);
  });

  it('should have the heartbeat cron in Hasura metadata, pointing at the backend with the secret header', async () => {
    const heartbeat = (await exportedCronTriggers()).find((c) => c.name === 'heartbeat');
    expect(heartbeat).toMatchObject({
      webhook: '{{BACKEND_URL}}/hasura/events/heartbeat',
      schedule: '*/5 * * * *',
      include_in_metadata: true,
      headers: [{ name: 'x-action-secret', value_from_env: 'ACTION_SECRET' }],
      retry_conf: { num_retries: 3, retry_interval_seconds: 10, timeout_seconds: 60 },
    });
  });

  it('should have the device_health_check cron every minute with a 120 s tolerance', async () => {
    const cron = (await exportedCronTriggers()).find((c) => c.name === 'device_health_check');
    expect(cron).toMatchObject({
      webhook: '{{BACKEND_URL}}/hasura/events/device_health_check',
      schedule: '* * * * *',
      retry_conf: { num_retries: 3, retry_interval_seconds: 10, timeout_seconds: 60, tolerance_seconds: 120 },
    });
  });

  it('should have the escalate (every minute) and send_digests (hourly) crons with their tolerances', async () => {
    const crons = await exportedCronTriggers();
    expect(crons.find((c) => c.name === 'escalate')).toMatchObject({
      webhook: '{{BACKEND_URL}}/hasura/events/escalate',
      schedule: '* * * * *',
      retry_conf: { tolerance_seconds: 120 },
    });
    expect(crons.find((c) => c.name === 'send_digests')).toMatchObject({
      webhook: '{{BACKEND_URL}}/hasura/events/send_digests',
      schedule: '0 * * * *',
      retry_conf: { tolerance_seconds: 3600 },
    });
  });
});
