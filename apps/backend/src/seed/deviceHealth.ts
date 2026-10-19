import { buildHealthHistory, lastWholeHour, NOVA_INCIDENTS, type HealthCall } from './deviceHealthPlan.js';
import type { SeedDevicesResult } from './devices.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/** Telemetry rows written per device in this run (0 when the device already had its history). */
export type SeedDeviceHealthResult = Record<string, number>;

// Seed history predates the device row; samples of the live health cron come after it.
const SEEDED = `
  query SeedHealthExisting($device: uuid!, $before: timestamptz!) {
    device_health_metrics_aggregate(where: { device_id: { _eq: $device }, recorded_at: { _lt: $before } }) {
      aggregate { count }
    }
  }
`;
const DROP_HISTORY = `
  mutation SeedDropHealthHistory($device: uuid!, $before: timestamptz!) {
    delete_device_health_metrics(where: { device_id: { _eq: $device }, recorded_at: { _lt: $before } }) { affected_rows }
  }
`;
// Earlier seeds wrote a frame rate; the live probe writes none.
const CLEAR_FRAME_RATE = `
  mutation SeedClearFrameRate($device: uuid!, $before: timestamptz!) {
    update_device_health_metrics(
      where: { device_id: { _eq: $device }, recorded_at: { _lt: $before }, frame_rate: { _is_null: false } }
      _set: { frame_rate: null }
    ) { affected_rows }
  }
`;
/**
 * One mutation per device (one transaction): a device has either its whole history or none. A sample at an hour the
 * live cron already recorded is skipped. Outages planned through the pipeline call itap.record_device_health at their
 * past times first (while no newer sample exists), then restore the device's last_seen_at to the last whole hour.
 */
function historyMutation(calls: HealthCall[]): string {
  const recorded = calls.map(
    (c, i) => `r${i}: record_device_health(args: { p_device: $device, p_reachable: ${c.reachable}, p_latency_ms: ${c.reachable ? 12 : 'null'},
                p_frame_ok: ${c.reachable}, p_checked_at: "${c.at}" }) { id }`,
  );
  const restore = calls.length > 0 ? ['seen: update_devices_by_pk(pk_columns: { id: $device }, _set: { last_seen_at: $seen }) { id }'] : [];
  const vars = calls.length > 0 ? '$device: uuid!, $seen: timestamptz!, ' : '';
  return `mutation SeedHealthHistory(${vars}$metrics: [device_health_metrics_insert_input!]!, $events: [device_events_insert_input!]!) {
    ${[...recorded, ...restore].join('\n    ')}
    insert_device_health_metrics(
      objects: $metrics
      on_conflict: { constraint: device_health_metrics_organization_id_device_id_recorded_at_key, update_columns: [] }
    ) { affected_rows }
    insert_device_events(objects: $events) { affected_rows }
  }`;
}

/**
 * 30 days of hourly telemetry per seeded device, inserted directly (no live producer exists for the past), with the
 * Nova Tower offline incidents and their device events (the parking gate outage through itap.record_device_health,
 * so it also leaves device_offline / device_online events). Written once per device (idempotent).
 */
export async function seedDeviceHealth(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  devices: SeedDevicesResult,
): Promise<SeedDeviceHealthResult> {
  const result: SeedDeviceHealthResult = {};
  for (const [key, device] of Object.entries(devices)) {
    if (device.camera && !device.streaming) {
      // Never probed (no stream_url): no history. Earlier seeds wrote one, drop it.
      await ctx.admin.request(DROP_HISTORY, { device: device.id, before: device.createdAt });
      result[key] = 0;
      continue;
    }
    const { device_health_metrics_aggregate: existing } = await ctx.admin.request<{
      device_health_metrics_aggregate: { aggregate: { count: number } };
    }>(SEEDED, { device: device.id, before: device.createdAt });
    if (existing.aggregate.count > 0) {
      if (device.camera) await ctx.admin.request(CLEAR_FRAME_RATE, { device: device.id, before: device.createdAt });
      result[key] = 0;
      continue;
    }
    const incidents = device.org === 'nova' ? NOVA_INCIDENTS.filter((i) => i.device === device.name) : [];
    const history = buildHealthHistory(key, device.camera ? 'camera' : 'host', ctx.now, incidents);
    const owner = { organization_id: tenancy.orgs[device.org], device_id: device.id };
    const data = await ctx.admin.request<{ insert_device_health_metrics: { affected_rows: number } }>(historyMutation(history.pipeline), {
      ...(history.pipeline.length > 0 ? { device: device.id, seen: lastWholeHour(ctx.now).toISOString() } : {}),
      metrics: history.metrics.map((m) => ({ ...owner, ...m })),
      events: history.events.map((e) => ({ ...owner, ...e })),
    });
    result[key] = data.insert_device_health_metrics.affected_rows;
  }
  return result;
}
