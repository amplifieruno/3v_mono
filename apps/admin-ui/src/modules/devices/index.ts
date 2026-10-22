import { healthChartBlock } from '../../blocks/health-chart/health-chart-block';
import { liveCameraBlock } from '../../blocks/live-camera/live-camera-block';
import { liveWallBlock } from '../../blocks/live-camera/live-wall-block';
import {
  deviceHealthSeries,
  deviceHealthSeriesOperation,
} from '../../blocks/health-chart/health-series-query';
import { hasuraTable, selectFieldsOf } from '../../data/mapping';
import {
  DEVICE_AREA_RESOURCE,
  DEVICE_EVENT_RESOURCE,
  DEVICE_HEALTH_METRIC_RESOURCE,
  DEVICE_RESOURCE,
} from '../../data/resource-names';
import type { ConsoleModule } from '../module';
import { device } from './device';
import { deviceArea, deviceAreaFields } from './device-area';
import { deviceEvent, deviceEventFields } from './device-event';
import { deviceFields } from './device-fields';
import { deviceHealthMetric, deviceHealthMetricFields } from './device-health-metric';
import { liveWallPage } from './live-wall-page';
import {
  recognitionStart,
  recognitionStartOperation,
  recognitionStatus,
  recognitionStatusOperation,
  recognitionStop,
  recognitionStopOperation,
} from './recognition';

/**
 * Devices: the cameras, access terminals and sensors of each facility (one record type per
 * kind), with their health, credentials, coverage and the areas they also cover; the health
 * samples and device events (append-only logs: no count per page, keyset paging); recognition
 * started, stopped and watched on each camera; and the cameras live with the faces recognised
 * on them, one per camera page and all together on the live wall.
 */
export const devicesModule = {
  name: 'devices-module',
  uses: [
    device,
    deviceArea,
    deviceHealthMetric,
    deviceEvent,
    recognitionStatus,
    recognitionStart,
    recognitionStop,
    deviceHealthSeries,
    healthChartBlock,
    liveCameraBlock,
    liveWallBlock,
    liveWallPage,
  ],
  tables: {
    [DEVICE_RESOURCE]: hasuraTable('devices', { selectFields: selectFieldsOf(deviceFields) }),
    [DEVICE_AREA_RESOURCE]: hasuraTable('device_areas', {
      selectFields: selectFieldsOf(deviceAreaFields),
    }),
    [DEVICE_HEALTH_METRIC_RESOURCE]: hasuraTable('device_health_metrics', {
      selectFields: selectFieldsOf(deviceHealthMetricFields),
      orderByField: 'recorded_at',
      noAggregate: true,
    }),
    [DEVICE_EVENT_RESOURCE]: hasuraTable('device_events', {
      selectFields: selectFieldsOf(deviceEventFields),
      orderByField: 'occurred_at',
      noAggregate: true,
    }),
  },
  operations: [
    recognitionStatusOperation,
    recognitionStartOperation,
    recognitionStopOperation,
    deviceHealthSeriesOperation,
  ],
} as const satisfies ConsoleModule;
