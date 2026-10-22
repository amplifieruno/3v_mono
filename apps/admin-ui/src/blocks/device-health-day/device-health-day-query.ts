import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_HEALTH_METRIC_RESOURCE, DEVICE_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { ANALYTICS_BINDING } from '../facility-period/analytics-binding';
import { DEVICE_SUMMARY_LIMIT } from '../device-health-summary/device-health-summary-query';
import { DEVICE_DAY_HOURS } from './device-health-day-block';

const average = z.number().nullable();

/** One device with its checks of the window summed up (`device_health_metrics_aggregate`). */
export const deviceDayRow = z.object({
  id: z.string(),
  name: z.string(),
  device_health_metrics_aggregate: z.object({
    aggregate: z.object({
      count: z.number(),
      sum: z.object({ error_count: z.number().nullable() }),
      avg: z.object({ cpu_usage: average, memory_usage: average, network_latency_ms: average, frame_rate: average }),
    }),
  }),
});

export type DeviceDayRow = z.infer<typeof deviceDayRow>;

const dayInput = z.object({ facilityId: z.string().uuid().nullable() });

/** The devices in service of one facility or of all, each with its last 24 hours of checks summed up. */
export const deviceHealthDayOperation = hasuraOperation(ANALYTICS_BINDING, 'deviceHealthDay', {
  kind: 'query',
  document: `query DeviceHealthDay($where: devices_bool_exp!, $since: timestamptz!) {
  devices(where: $where, order_by: [{ name: asc }], limit: ${DEVICE_SUMMARY_LIMIT}) {
    id
    name
    device_health_metrics_aggregate(where: { recorded_at: { _gte: $since } }) {
      aggregate {
        count
        sum {
          error_count
        }
        avg {
          cpu_usage
          memory_usage
          network_latency_ms
          frame_rate
        }
      }
    }
  }
}`,
  variables: (input) => {
    const { facilityId } = input as z.infer<typeof dayInput>;
    return {
      where: { status: { _neq: 'inactive' }, ...(facilityId === null ? {} : { facility_id: { _eq: facilityId } }) },
      since: new Date(Date.now() - DEVICE_DAY_HOURS * 3_600_000).toISOString(),
    };
  },
  mapResult: (data) => {
    const rows = z.array(deviceDayRow).safeParse(rootOf(data, 'devices'));
    return rows.success ? rows.data : null;
  },
});

/** The devices of the 24-hour health table (`itap:device-health-day`). */
export const deviceHealthDay = defineQuery('itap:device-health-day-rows', {
  binding: deviceHealthDayOperation.binding,
  input: schema(dayInput),
  output: schema(z.array(deviceDayRow).nullable()),
  reads: [resourceByName(DEVICE_RESOURCE), resourceByName(DEVICE_HEALTH_METRIC_RESOURCE)],
});

/** The rows in reading order: the devices with failed checks first (most first), then by name. */
export function devicesByTrouble(rows: readonly DeviceDayRow[]): DeviceDayRow[] {
  const failed = (row: DeviceDayRow) => row.device_health_metrics_aggregate.aggregate.sum.error_count ?? 0;
  return [...rows].sort((a, b) => failed(b) - failed(a) || a.name.localeCompare(b.name));
}
