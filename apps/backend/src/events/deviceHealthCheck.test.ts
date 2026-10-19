import { describe, expect, it, vi } from 'vitest';
import type { Env } from '../config/env.js';
import type { HasuraClient } from '../hasura/client.js';
import {
  createDeviceHealthCheck,
  mapSnapshotResponse,
  streamIdOf,
  type FetchLike,
} from './deviceHealthCheck.js';
import { runWithConcurrency } from '../util/concurrency.js';
import type { CronTriggerPayload } from './types.js';

const env = { STREAM_SERVER_URL: 'http://stream-server:8888/' } as Env;
const payload: CronTriggerPayload = {
  id: 'run-1',
  name: 'device_health_check',
  scheduled_time: '2026-01-01T00:05:00+00:00',
  payload: {},
};

type Camera = { id: string; stream_url: string };
const cams: Camera[] = ['a', 'b', 'c'].map((id) => ({ id: `dev-${id}`, stream_url: `rtsp://mediamtx:8554/${id}` }));

function fakeAdmin(devices: Camera[], failFor: string[] = []) {
  const calls: { device: string; reachable: boolean; frame: boolean; latency: number | null; at: string }[] = [];
  const request = vi.fn(async (query: string, variables?: Record<string, unknown>) => {
    if (query.includes('RecordDeviceHealth')) {
      const v = variables as { device: string; reachable: boolean; frame: boolean; latency: number | null; at: string };
      if (failFor.includes(v.device)) throw new Error('hasura down');
      calls.push({ device: v.device, reachable: v.reachable, frame: v.frame, latency: v.latency, at: v.at });
      return { record_device_health: [] };
    }
    return { devices };
  });
  return { admin: { request } as unknown as HasuraClient, calls, request };
}

const jpeg = (): Response => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } });

function fakeFetch(handler: (url: string) => Response | Promise<Response>): FetchLike & { urls: string[] } {
  const urls: string[] = [];
  const fn: FetchLike = async (input) => {
    urls.push(input);
    return handler(input);
  };
  return Object.assign(fn, { urls });
}

const run = (fetchFn: FetchLike, admin: HasuraClient, options = {}) =>
  createDeviceHealthCheck({ fetch: fetchFn, ...options }).handle(payload, { env, admin, idempotencyKey: 'k' });

describe('streamIdOf', () => {
  it.each([
    ['rtsp://mediamtx:8554/lobby', 'lobby'],
    ['rtsp://mediamtx:8554/lobby/', 'lobby'],
    ['rtsp://user:pw@host:554/cams/entrance?x=1', 'entrance'],
    ['rtsp://host:554', null],
    ['not a url', null],
    ['', null],
  ])('should extract the stream id of %s', (url, id) => {
    expect(streamIdOf(url)).toBe(id);
  });
});

describe('mapSnapshotResponse', () => {
  it('should treat a 200 image as reachable with a frame', () => {
    expect(mapSnapshotResponse(200, 'image/jpeg', 100)).toBe('healthy');
  });
  it.each([
    [200, 'text/html', 100],
    [200, 'image/jpeg', 0],
    [404, 'text/plain', 5],
    [503, 'image/jpeg', 10],
  ])('should treat %s %s (%s bytes) as reachable without a frame', (status, type, bytes) => {
    expect(mapSnapshotResponse(status, type, bytes)).toBe('no_frame');
  });
});

describe('runWithConcurrency', () => {
  it('should never run more than the limit in parallel and keep result order', async () => {
    let active = 0;
    let peak = 0;
    const out = await runWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 5, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(peak).toBe(5);
    expect(out).toEqual(Array.from({ length: 12 }, (_, i) => i * 2));
  });
});

describe('deviceHealthCheck handler', () => {
  it('should probe /health once, snapshot each camera and record with checked_at = scheduled_time', async () => {
    const { admin, calls } = fakeAdmin(cams);
    const f = fakeFetch((url) => (url.endsWith('/health') ? new Response('ok') : jpeg()));
    const result = await run(f, admin);
    expect(f.urls.filter((u) => u.endsWith('/health'))).toEqual(['http://stream-server:8888/health']);
    expect(f.urls.filter((u) => u.includes('snapshot'))).toEqual(
      ['a', 'b', 'c'].map((s) => `http://stream-server:8888/streams/${s}/snapshot.jpg`),
    );
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.reachable && c.frame && c.at === '2026-01-01T00:05:00.000Z')).toBe(true);
    expect(result).toMatchObject({ checked: 3, healthy: 3, warning: 0, critical: 0, skipped: 0 });
  });

  it('should record every device critical from one /health probe when the stream-server is down (no snapshot requests)', async () => {
    const { admin, calls } = fakeAdmin(cams);
    const f = fakeFetch(() => {
      throw new TypeError('fetch failed');
    });
    const result = await run(f, admin);
    expect(f.urls).toEqual(['http://stream-server:8888/health']);
    expect(calls.map((c) => [c.reachable, c.frame, c.latency])).toEqual([[false, false, null], [false, false, null], [false, false, null]]);
    expect(result).toMatchObject({ checked: 3, critical: 3, server_up: false });
  });

  it('should treat a non-200 /health as down', async () => {
    const { admin, calls } = fakeAdmin(cams);
    await run(fakeFetch(() => new Response('bad', { status: 502 })), admin);
    expect(calls.every((c) => !c.reachable)).toBe(true);
  });

  it('should map a missing stream (404) to warning and a snapshot network error to critical', async () => {
    const { admin, calls } = fakeAdmin(cams);
    const f = fakeFetch((url) => {
      if (url.endsWith('/health')) return new Response('ok');
      if (url.includes('/a/')) return new Response('nope', { status: 404 });
      if (url.includes('/b/')) throw new TypeError('reset');
      return jpeg();
    });
    const result = await run(f, admin);
    const by = Object.fromEntries(calls.map((c) => [c.device, [c.reachable, c.frame]]));
    expect(by).toEqual({ 'dev-a': [true, false], 'dev-b': [false, false], 'dev-c': [true, true] });
    expect(result).toMatchObject({ healthy: 1, warning: 1, critical: 1 });
  });

  it('should time out a hanging snapshot after the timeout and mark it critical', async () => {
    const { admin, calls } = fakeAdmin([cams[0]]);
    const f = fakeFetch((url) => (url.endsWith('/health') ? new Response('ok') : new Response(null)));
    const hanging: FetchLike = (url, init) =>
      url.endsWith('/health')
        ? f(url, init)
        : new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'TimeoutError'))));
    await run(hanging, admin, { timeoutMs: 30 });
    expect(calls).toEqual([expect.objectContaining({ device: 'dev-a', reachable: false })]);
  });

  it('should skip cameras without a usable stream id and keep going', async () => {
    const { admin, calls } = fakeAdmin([{ id: 'x', stream_url: 'rtsp://host' }, cams[0]]);
    const result = await run(fakeFetch((url) => (url.endsWith('/health') ? new Response('ok') : jpeg())), admin);
    expect(calls.map((c) => c.device)).toEqual(['dev-a']);
    expect(result).toMatchObject({ checked: 1, skipped: 1 });
  });

  it('should record the other devices and then fail the run when a record call fails (retry is idempotent)', async () => {
    const { admin, calls } = fakeAdmin(cams, ['dev-b']);
    await expect(run(fakeFetch((url) => (url.endsWith('/health') ? new Response('ok') : jpeg())), admin)).rejects.toThrow(/1 of 3/);
    expect(calls.map((c) => c.device).sort()).toEqual(['dev-a', 'dev-c']);
  });

  it('should do nothing without cameras and reject an invalid scheduled_time', async () => {
    const { admin, calls } = fakeAdmin([]);
    const f = fakeFetch(() => new Response('ok'));
    expect(await run(f, admin)).toMatchObject({ checked: 0 });
    expect(f.urls).toEqual([]);
    expect(calls).toEqual([]);
    await expect(
      createDeviceHealthCheck({ fetch: f }).handle({ ...payload, scheduled_time: 'garbage' }, { env, admin, idempotencyKey: 'k' }),
    ).rejects.toThrow(/scheduled_time/);
  });
});
