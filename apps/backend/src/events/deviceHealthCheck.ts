import { defineCronHandler } from './types.js';
import type { HasuraClient } from '../hasura/client.js';

/** Minimal fetch shape used for probes (injectable for tests). */
export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<Response>;

const PROBE_TIMEOUT_MS = 3000;
const CONCURRENCY = 5;

const LIST_CAMERAS = `
  query HealthCheckCameras {
    devices(
      where: {
        device_type: { _in: [static_video_camera, ptz_camera, thermal_camera] }
        status: { _in: [active, connection_error] }
        stream_url: { _is_null: false }
      }
      order_by: { created_at: asc }
    ) { id stream_url }
  }
`;
// connection_error cameras stay in the list on purpose: they must be probed to recover.

const RECORD_HEALTH = `
  mutation RecordDeviceHealth($device: uuid!, $reachable: Boolean!, $latency: Float, $frame: Boolean!, $at: timestamptz!) {
    record_device_health(
      args: { p_device: $device, p_reachable: $reachable, p_latency_ms: $latency, p_frame_ok: $frame, p_checked_at: $at }
    ) { id }
  }
`;

type Camera = { id: string; stream_url: string };
type Probe = { reachable: boolean; frameOk: boolean; latencyMs: number | null };

const DOWN: Probe = { reachable: false, frameOk: false, latencyMs: null };

/** Stream id = last path segment of the stream URL (rtsp://mediamtx:8554/lobby -> lobby); null when there is none. */
export function streamIdOf(streamUrl: string): string | null {
  try {
    const segments = new URL(streamUrl).pathname.split('/').filter(Boolean);
    const last = segments.at(-1);
    return last ? decodeURIComponent(last) : null;
  } catch {
    return null;
  }
}

/** The stream-server answered for this stream: a non-empty image is a frame, anything else is reachable but frameless. */
export function mapSnapshotResponse(status: number, contentType: string | null, bytes: number): 'healthy' | 'no_frame' {
  return status === 200 && (contentType ?? '').startsWith('image/') && bytes > 0 ? 'healthy' : 'no_frame';
}

/** Maps over items with at most `limit` calls in flight; results keep the input order. */
export async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

interface Options {
  fetch?: FetchLike;
  timeoutMs?: number;
  concurrency?: number;
}

/**
 * Cron `device_health_check` (every minute, design §8.3): real probes of the stream-server for every active camera
 * of every organization, recorded through itap.record_device_health with checked_at = the cron's scheduled_time, so
 * a Hasura retry of the same run is a no-op. Non-camera devices are untouched.
 *
 * One code path for the stream-server being down: `/health` is probed once; when it fails every camera gets the
 * unreachable result without further requests. Transitions (and their device_events) are decided in SQL.
 */
export function createDeviceHealthCheck(options: Options = {}) {
  const fetchFn: FetchLike = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? PROBE_TIMEOUT_MS;
  const concurrency = options.concurrency ?? CONCURRENCY;

  async function serverIsUp(base: string): Promise<boolean> {
    try {
      const res = await fetchFn(`${base}/health`, { signal: AbortSignal.timeout(timeoutMs) });
      await res.arrayBuffer();
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async function probeSnapshot(base: string, streamId: string): Promise<Probe> {
    const started = performance.now();
    try {
      const res = await fetchFn(`${base}/streams/${encodeURIComponent(streamId)}/snapshot.jpg`, {
        signal: AbortSignal.timeout(timeoutMs),
      });
      const bytes = (await res.arrayBuffer()).byteLength;
      const latencyMs = Math.round(performance.now() - started);
      const frameOk = mapSnapshotResponse(res.status, res.headers.get('content-type'), bytes) === 'healthy';
      return { reachable: true, frameOk, latencyMs };
    } catch {
      return DOWN;
    }
  }

  async function record(admin: HasuraClient, device: string, probe: Probe, at: string): Promise<void> {
    await admin.request(RECORD_HEALTH, {
      device,
      reachable: probe.reachable,
      latency: probe.latencyMs,
      frame: probe.frameOk,
      at,
    });
  }

  return defineCronHandler(async (payload, ctx) => {
    const checkedAt = new Date(payload.scheduled_time);
    if (Number.isNaN(checkedAt.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
    const at = checkedAt.toISOString();
    const base = ctx.env.STREAM_SERVER_URL.replace(/\/+$/, '');

    const { devices } = await ctx.admin.request<{ devices: Camera[] }>(LIST_CAMERAS);
    const cameras = devices.flatMap((d) => {
      const streamId = streamIdOf(d.stream_url);
      return streamId ? [{ id: d.id, streamId }] : [];
    });
    const skipped = devices.length - cameras.length;
    if (cameras.length === 0) return { checked: 0, skipped };

    const serverUp = await serverIsUp(base);
    const outcomes = await runWithConcurrency(cameras, concurrency, async (camera) => {
      const probe = serverUp ? await probeSnapshot(base, camera.streamId) : DOWN;
      try {
        await record(ctx.admin, camera.id, probe, at);
        return { probe, recorded: true };
      } catch {
        return { probe, recorded: false };
      }
    });

    const failed = outcomes.filter((o) => !o.recorded).length;
    if (failed > 0) throw new Error(`device_health_check: recording failed for ${failed} of ${cameras.length} devices`);
    const count = (pick: (p: Probe) => boolean) => outcomes.filter((o) => pick(o.probe)).length;
    return {
      checked: cameras.length,
      skipped,
      server_up: serverUp,
      healthy: count((p) => p.reachable && p.frameOk),
      warning: count((p) => p.reachable && !p.frameOk),
      critical: count((p) => !p.reachable),
    };
  });
}

export const deviceHealthCheck = createDeviceHealthCheck();
