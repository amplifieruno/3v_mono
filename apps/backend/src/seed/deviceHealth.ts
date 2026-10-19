import { buildHealthHistory, NOVA_INCIDENTS } from './deviceHealthPlan.js';
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
// One mutation per device (one transaction): a device has either its whole history or none. A sample at an hour the
// live cron already recorded is skipped.
const INSERT_HISTORY = `
  mutation SeedHealthHistory($metrics: [device_health_metrics_insert_input!]!, $events: [device_events_insert_input!]!) {
    insert_device_health_metrics(
      objects: $metrics
      on_conflict: { constraint: device_health_metrics_organization_id_device_id_recorded_at_key, update_columns: [] }
    ) { affected_rows }
    insert_device_events(objects: $events) { affected_rows }
  }
`;

/**
 * 30 days of hourly telemetry per seeded device, inserted directly (no live producer exists for the past), with the
 * Nova Tower offline incidents and their device events. Written once per device (idempotent).
 */
export async function seedDeviceHealth(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  devices: SeedDevicesResult,
): Promise<SeedDeviceHealthResult> {
  const result: SeedDeviceHealthResult = {};
  for (const [key, device] of Object.entries(devices)) {
    const { device_health_metrics_aggregate: existing } = await ctx.admin.request<{
      device_health_metrics_aggregate: { aggregate: { count: number } };
    }>(SEEDED, { device: device.id, before: device.createdAt });
    if (existing.aggregate.count > 0) {
      result[key] = 0;
      continue;
    }
    const incidents = device.org === 'nova' ? NOVA_INCIDENTS.filter((i) => i.device === device.name) : [];
    const history = buildHealthHistory(key, device.camera ? 'camera' : 'host', ctx.now, incidents);
    const owner = { organization_id: tenancy.orgs[device.org], device_id: device.id };
    const data = await ctx.admin.request<{ insert_device_health_metrics: { affected_rows: number } }>(INSERT_HISTORY, {
      metrics: history.metrics.map((m) => ({ ...owner, ...m })),
      events: history.events.map((e) => ({ ...owner, ...e })),
    });
    result[key] = data.insert_device_health_metrics.affected_rows;
  }
  return result;
}
