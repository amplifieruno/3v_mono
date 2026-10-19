import { seededRandom } from './random.js';

/**
 * Past device telemetry for the seed (no live producer exists for the past): one sample per whole hour for the 30 days
 * before `now`, strictly before it, so the live health cron (one sample per minute from now on) never collides.
 *
 * - `camera`: probed through the stream-server like the cron does (latency only: the live probe writes a NULL
 *   frame rate, so does the history); host metrics are NULL. While offline the probe still records a sample (no
 *   latency, one error). A camera without a stream_url is never probed and has no history (see seedDeviceHealth).
 * - `host` (terminals, sensors): heartbeat with CPU / memory / disk; while offline no heartbeat arrives (no row).
 *
 * An incident yields an `offline` event at its first hour and an `online` event at the first hour after it, with the
 * messages and payload shapes of itap.record_device_health; a `viaPipeline` incident yields the two
 * record_device_health calls instead (seedDeviceHealth runs them before inserting the samples).
 */
export type HealthKind = 'camera' | 'host';

export type Incident = {
  device: string;
  startHoursAgo: number;
  hours: number;
  reason: string;
  /**
   * Recorded through itap.record_device_health at the simulated times (device_events plus the device_offline /
   * device_online platform events) instead of direct device_events rows. Only for a device the live health cron
   * never probes: a newer live sample would make the function ignore the past calls.
   */
  viaPipeline?: boolean;
};

/** One planned itap.record_device_health call (reachable false = offline probe). */
export type HealthCall = { reachable: boolean; at: string };

export type MetricSample = {
  recorded_at: string;
  cpu_usage: number | null;
  memory_usage: number | null;
  disk_usage: number | null;
  network_latency_ms: number | null;
  frame_rate: number | null;
  error_count: number;
};

export type DeviceEventSample = {
  kind: 'offline' | 'online';
  message: string;
  payload: Record<string, unknown>;
  occurred_at: string;
};

export const HISTORY_HOURS = 30 * 24;

const HOUR_MS = 60 * 60 * 1000;

/** Offline incidents of the Nova Tower history (2 cameras, 1 terminal). */
export const NOVA_INCIDENTS: Incident[] = [
  { device: 'Lobby Camera', startHoursAgo: 4 * 24 + 2, hours: 1, reason: 'PoE switch restart' },
  { device: 'Loading Dock Camera', startHoursAgo: 9 * 24 + 5, hours: 3, reason: 'Network cabling work at the dock' },
  { device: 'Parking Gate Terminal', startHoursAgo: 17 * 24 + 11, hours: 5, reason: 'Power outage on parking level P-1', viaPipeline: true },
];

/** The latest whole hour strictly before `now`. */
export function lastWholeHour(now: Date): Date {
  return new Date(Math.floor((now.getTime() - 1) / HOUR_MS) * HOUR_MS);
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Hourly samples (oldest first) and incident events of one device; deterministic for the same key and `now`. */
export function buildHealthHistory(
  key: string,
  kind: HealthKind,
  now: Date,
  incidents: Incident[],
): { metrics: MetricSample[]; events: DeviceEventSample[]; pipeline: HealthCall[] } {
  const random = seededRandom(`health/${key}`);
  const last = lastWholeHour(now).getTime();
  const offlineHoursAgo = new Set<number>();
  const events: DeviceEventSample[] = [];
  const pipeline: HealthCall[] = [];
  for (const incident of incidents) {
    for (let h = 0; h < incident.hours; h += 1) offlineHoursAgo.add(incident.startHoursAgo - h);
    const end = incident.startHoursAgo - incident.hours;
    if (incident.viaPipeline) {
      pipeline.push(
        { reachable: false, at: new Date(last - incident.startHoursAgo * HOUR_MS).toISOString() },
        { reachable: true, at: new Date(last - end * HOUR_MS).toISOString() },
      );
      continue;
    }
    events.push({
      kind: 'offline',
      message: 'Device is unreachable',
      payload: { previous_health_status: 'healthy', reason: incident.reason },
      occurred_at: new Date(last - incident.startHoursAgo * HOUR_MS).toISOString(),
    });
    events.push({
      kind: 'online',
      message: 'Device is reachable again',
      payload: { latency_ms: random.int(8, 20) },
      occurred_at: new Date(last - end * HOUR_MS).toISOString(),
    });
  }

  const metrics: MetricSample[] = [];
  const diskBase = 20 + random.next() * 25;
  for (let hoursAgo = HISTORY_HOURS - 1; hoursAgo >= 0; hoursAgo -= 1) {
    const recordedAt = new Date(last - hoursAgo * HOUR_MS);
    const offline = offlineHoursAgo.has(hoursAgo);
    if (offline && kind === 'host') continue;
    const base = { recorded_at: recordedAt.toISOString(), cpu_usage: null, memory_usage: null, disk_usage: null };
    if (offline) {
      metrics.push({ ...base, network_latency_ms: null, frame_rate: null, error_count: 1 });
      continue;
    }
    // Busier during office hours (UTC+3 day ≈ 05:00–17:00 UTC).
    const hour = recordedAt.getUTCHours();
    const busy = hour >= 5 && hour < 17 ? 1 : 0;
    const latency = round1(6 + random.next() * 14 + busy * 6);
    if (kind === 'camera') {
      metrics.push({ ...base, network_latency_ms: latency, frame_rate: null, error_count: 0 });
      continue;
    }
    const age = (HISTORY_HOURS - hoursAgo) / HISTORY_HOURS;
    metrics.push({
      ...base,
      cpu_usage: round1(4 + random.next() * 12 + busy * 14),
      memory_usage: round1(32 + random.next() * 10 + busy * 8),
      disk_usage: round1(Math.min(95, diskBase + age * 6)),
      network_latency_ms: latency,
      frame_rate: null,
      error_count: random.chance(0.01) ? 1 : 0,
    });
  }
  return { metrics, events, pipeline };
}
