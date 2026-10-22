import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

/** The window the table sums up, in hours. */
export const DEVICE_DAY_HOURS = 24;

/**
 * Every device's health over the last 24 hours (`itap:device-health-day`, `device_health_metrics`
 * per device of `devices`): one row per device in service with its checks, failed checks and its
 * average CPU, memory, latency and frame rate over the window (empty when it reported none), the
 * devices with failed checks first. Prop `facilityId` (`null` = every facility). One device's
 * curves are the device page's health chart.
 */
export const deviceHealthDayBlock = defineBlock('itap:device-health-day', {
  texts: {
    label: 'Device health over 24 hours',
    loading: 'Reading the devices’ checks…',
    failed: 'The devices’ checks could not be read.',
    none: 'No device in service.',
    caption: 'Each device’s checks over the last 24 hours, averaged',
    device: 'Device',
    checks: 'Checks',
    failedChecks: 'Failed checks',
    cpu: 'CPU',
    memory: 'Memory',
    latency: 'Latency',
    frameRate: 'Frame rate',
    percent: '{{value}} %',
    ms: '{{value}} ms',
    fps: '{{value}} fps',
    noValue: '—',
  },
  props: {
    facilityId: prop(z.string().nullable().optional()).default(null),
  },
});
