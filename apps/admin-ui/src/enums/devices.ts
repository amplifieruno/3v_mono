import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Devices enums; values are the rows of the Hasura enum tables in `DEVICES_ENUM_TABLES`. */

export const DEVICE_TYPE_ENUM = 'device_type';

/** The camera types: they stream video and can run recognition. */
export const CAMERA_DEVICE_TYPES = ['static_video_camera', 'ptz_camera', 'thermal_camera'] as const;

export const DEVICE_TYPES = [...CAMERA_DEVICE_TYPES, 'access_terminal', 'sensor'] as const;

export const deviceTypeEnum = defineEnum({
  name: DEVICE_TYPE_ENUM,
  values: enumValues(DEVICE_TYPES, {
    static_video_camera: 'info',
    ptz_camera: 'info',
    thermal_camera: 'info',
    access_terminal: 'default',
    sensor: 'outline',
  }),
  texts: {
    static_video_camera: {
      label: 'Static camera',
      doc: { summary: 'A fixed video camera; its stream can be watched live and run face recognition.' },
    },
    ptz_camera: {
      label: 'PTZ camera',
      doc: { summary: 'A pan-tilt-zoom video camera; streams and recognises like a static camera.' },
    },
    thermal_camera: {
      label: 'Thermal camera',
      doc: { summary: 'A camera reading heat images; streams like the other cameras.' },
    },
    access_terminal: {
      label: 'Access terminal',
      doc: {
        summary:
          'A badge, PIN or face reader that decides and opens a passage; it receives the organization’s access policies.',
      },
    },
    sensor: {
      label: 'Sensor',
      doc: { summary: 'Reports a state, such as a door contact or a motion detector; no video.' },
    },
  },
});

export const DEVICE_STATUS_ENUM = 'device_status';

export const DEVICE_STATUSES = ['active', 'inactive', 'error', 'maintenance', 'connection_error'] as const;

export const deviceStatusEnum = defineEnum({
  name: DEVICE_STATUS_ENUM,
  values: enumValues(DEVICE_STATUSES, {
    active: 'success',
    inactive: 'secondary',
    error: 'destructive',
    maintenance: 'warning',
    connection_error: 'destructive',
  }),
  texts: {
    active: 'Active',
    inactive: { label: 'Inactive', doc: { summary: 'Retired; kept for its history and not checked.' } },
    error: { label: 'Error', doc: { summary: 'Marked faulty by an operator.' } },
    maintenance: {
      label: 'Under maintenance',
      doc: { summary: 'Temporarily out of service on purpose; not set back to active automatically.' },
    },
    connection_error: {
      label: 'Connection error',
      doc: {
        summary:
          'Set by the health check when an active camera cannot be reached; set back to active when it answers again.',
      },
    },
  },
});

export const DEVICE_HEALTH_ENUM = 'device_health_status';

export const DEVICE_HEALTH_STATUSES = ['healthy', 'warning', 'critical', 'unknown'] as const;

export const deviceHealthEnum = defineEnum({
  name: DEVICE_HEALTH_ENUM,
  values: enumValues(DEVICE_HEALTH_STATUSES, {
    healthy: 'success',
    warning: 'warning',
    critical: 'destructive',
    unknown: 'secondary',
  }),
  texts: {
    healthy: { label: 'Healthy', doc: { summary: 'Reachable and delivering frames at the last check.' } },
    warning: {
      label: 'Warning',
      doc: { summary: 'Reachable at the last check, but it delivered no frame.' },
    },
    critical: { label: 'Offline', doc: { summary: 'Unreachable at the last check.' } },
    unknown: {
      label: 'Unknown',
      doc: { summary: 'Not checked yet; the health check probes active cameras only.' },
    },
  },
});

/** Each devices enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const DEVICES_ENUM_TABLES: Readonly<Record<string, string>> = {
  [DEVICE_TYPE_ENUM]: 'device_types',
  [DEVICE_STATUS_ENUM]: 'device_statuses',
  [DEVICE_HEALTH_ENUM]: 'device_health_statuses',
};
