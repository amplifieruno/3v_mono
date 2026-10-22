import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { DEVICE_HEALTH_METRIC_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import {
  HEALTH_SAMPLE_LIMIT,
  HEALTH_WINDOW_HOURS,
  bucketHealth,
  healthSample,
  healthSeries,
} from './health-series';

/** The registry key the health chart's operation is bound under. */
export const HEALTH_CHART_BINDING = 'health-chart';

/**
 * The samples of one device over the last 24 h, read newest first straight from
 * `device_health_metrics` (a `source.list` reads at most 100 rows, a camera writes 1440 a day)
 * and folded into 15-minute points when the answer arrives. The window starts when the request
 * is made, so the cached input stays the device id alone.
 */
export const deviceHealthSeriesOperation = hasuraOperation(HEALTH_CHART_BINDING, 'deviceHealthSeries', {
  kind: 'query',
  document: `query DeviceHealthSeries($device: uuid!, $since: timestamptz!, $limit: Int!) {
  device_health_metrics(
    where: { device_id: { _eq: $device }, recorded_at: { _gte: $since } }
    order_by: [{ recorded_at: desc }]
    limit: $limit
  ) {
    recorded_at
    cpu_usage
    memory_usage
    network_latency_ms
    frame_rate
    error_count
  }
}`,
  variables: (input) => ({
    device: (input as { deviceId: string }).deviceId,
    since: new Date(Date.now() - HEALTH_WINDOW_HOURS * 3_600_000).toISOString(),
    limit: HEALTH_SAMPLE_LIMIT,
  }),
  mapResult: (data) => {
    const rows = z.array(healthSample).safeParse(rootOf(data, 'device_health_metrics'));
    // Read newest first, so a window past the limit drops the oldest samples; bucketed oldest first.
    return rows.success ? bucketHealth([...rows.data].reverse(), new Date()) : null;
  },
});

/** One device's health over the last 24 h in 15-minute points (`itap:health-chart`). */
export const deviceHealthSeries = defineQuery('itap:device-health-series', {
  binding: deviceHealthSeriesOperation.binding,
  input: schema(z.object({ deviceId: z.string().uuid() })),
  output: schema(healthSeries.nullable()),
  reads: [resourceByName(DEVICE_HEALTH_METRIC_RESOURCE)],
});
