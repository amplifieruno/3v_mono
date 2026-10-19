import { describe, expect, it } from 'vitest';
import { createDeviceHealthCheck } from '../../src/events/deviceHealthCheck.js';
import type { Env } from '../../src/config/env.js';
import type { HasuraClient } from '../../src/hasura/client.js';
import { asAdmin, asOrgAdmin, testEnv } from './support/clients.js';
import { createDevice, createFacility } from './support/facilities.js';
import { createTwoOrgs } from './support/fixtures.js';

const REAL_STREAM_SERVER = `http://localhost:${process.env.STREAM_SERVER_PORT ?? 8888}`;
const DEAD_STREAM_SERVER = 'http://127.0.0.1:1';

const STATE = `query($ids: [uuid!]!) { devices(where: {id: {_in: $ids}}, order_by: {name: asc}) { name status health_status last_seen_at } }`;
const EVENTS = `query($id: uuid!) { device_events(where: {device_id: {_eq: $id}}, order_by: {occurred_at: asc}) { kind } }`;
const METRICS = `query($id: uuid!) { device_health_metrics(where: {device_id: {_eq: $id}}) { recorded_at network_latency_ms } }`;

/** The handler lists cameras of every organization; the test restricts it to its own devices (shared dev database). */
function scopedAdmin(ids: string[]): HasuraClient {
  const admin = asAdmin();
  return {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      const list = data as { devices?: { id: string }[] };
      if (list.devices) list.devices = list.devices.filter((d) => ids.includes(d.id));
      return data;
    },
  };
}

function runner(streamServerUrl: string, ids: string[]) {
  const env: Env = { ...testEnv(), STREAM_SERVER_URL: streamServerUrl };
  const handler = createDeviceHealthCheck({ timeoutMs: 2000 });
  let n = 0;
  return (minute = n++) =>
    handler.handle(
      { id: `run-${minute}`, name: 'device_health_check', scheduled_time: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), payload: {} },
      { env, admin: scopedAdmin(ids), idempotencyKey: `k-${minute}` },
    );
}

async function fixture() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const facility = await createFacility(a);
  const camera = (name: string, url: string | null, extra: Record<string, unknown> = {}) =>
    createDevice(a, facility.id, { name, stream_url: url, ...extra });
  const state = async (ids: string[]) =>
    (await asAdmin().request<{ devices: { name: string; status: string; health_status: string; last_seen_at: string | null }[] }>(STATE, { ids })).devices;
  const kinds = async (id: string) =>
    (await asAdmin().request<{ device_events: { kind: string }[] }>(EVENTS, { id })).device_events.map((e) => e.kind);
  return { camera, state, kinds };
}

describe('device_health_check handler', () => {
  it('should mark real streams healthy, a missing stream warning, and leave non-cameras and inactive cameras untouched', async () => {
    const { camera, state } = await fixture();
    const entrance = await camera('cam-entrance', 'rtsp://mediamtx:8554/entrance');
    const ghost = await camera('cam-ghost', 'rtsp://mediamtx:8554/no-such-stream');
    const terminal = await camera('terminal', 'rtsp://mediamtx:8554/entrance', { device_type: 'access_terminal' });
    const off = await camera('cam-off', 'rtsp://mediamtx:8554/lobby', { status: 'inactive' });
    const noUrl = await camera('cam-nourl', null);
    const ids = [entrance.id, ghost.id, terminal.id, off.id, noUrl.id];

    const result = await runner(REAL_STREAM_SERVER, ids)();
    expect(result).toMatchObject({ checked: 2, healthy: 1, warning: 1, critical: 0, server_up: true });

    const byName = Object.fromEntries((await state(ids)).map((d) => [d.name, d]));
    expect(byName['cam-entrance']).toMatchObject({ health_status: 'healthy', status: 'active' });
    expect(byName['cam-entrance'].last_seen_at).not.toBeNull();
    expect(byName['cam-ghost']).toMatchObject({ health_status: 'warning' });
    for (const untouched of ['terminal', 'cam-off', 'cam-nourl']) {
      expect(byName[untouched]).toMatchObject({ health_status: 'unknown', last_seen_at: null });
    }
    const metrics = await asAdmin().request<{ device_health_metrics: { network_latency_ms: number }[] }>(METRICS, { id: entrance.id });
    expect(metrics.device_health_metrics).toHaveLength(1);
    expect(metrics.device_health_metrics[0].network_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('should go critical/offline exactly once while the stream-server is down, then recover once (Review Focus 3 and 4)', async () => {
    const { camera, state, kinds } = await fixture();
    const first = await camera('cam-1', 'rtsp://mediamtx:8554/entrance');
    const second = await camera('cam-2', 'rtsp://mediamtx:8554/lobby');
    const ids = [first.id, second.id];

    await runner(REAL_STREAM_SERVER, ids)(0);
    const down = runner(DEAD_STREAM_SERVER, ids);
    for (const minute of [1, 2, 3, 4]) {
      expect(await down(minute)).toMatchObject({ checked: 2, critical: 2, server_up: false });
    }
    expect((await state(ids)).map((d) => [d.health_status, d.status])).toEqual([
      ['critical', 'connection_error'],
      ['critical', 'connection_error'],
    ]);
    expect(await kinds(first.id)).toEqual(['offline']);

    const up = runner(REAL_STREAM_SERVER, ids);
    for (const minute of [5, 6]) await up(minute);
    expect((await state(ids)).map((d) => [d.health_status, d.status])).toEqual([
      ['healthy', 'active'],
      ['healthy', 'active'],
    ]);
    expect(await kinds(first.id)).toEqual(['offline', 'online']);
  });

  it('should treat a replayed cron run (same scheduled_time) as a no-op', async () => {
    const { camera, kinds } = await fixture();
    const cam = await camera('cam-r', 'rtsp://mediamtx:8554/entrance');
    const run = runner(DEAD_STREAM_SERVER, [cam.id]);
    await run(7);
    await run(7);
    expect(await kinds(cam.id)).toEqual(['offline']);
    const metrics = await asAdmin().request<{ device_health_metrics: unknown[] }>(METRICS, { id: cam.id });
    expect(metrics.device_health_metrics).toHaveLength(1);
  });
});
