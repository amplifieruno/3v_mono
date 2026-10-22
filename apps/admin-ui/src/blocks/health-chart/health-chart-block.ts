import { absent, defineBlock, prop, source } from '@burojs/core';
import { z } from 'zod';
import { deviceHealthSeries } from './health-series-query';

/**
 * A device's health over the last 24 h (`itap:health-chart`): one small chart per measure the
 * device reports (CPU, memory, latency, frame rate), each a line over a shaded area on its own
 * scale, with the 15-minute periods that had a failed check marked. Prop `deviceId` (the device
 * page passes its record). Measures the device never reports are left out; with no sample in
 * the window it says so.
 */
export const healthChartBlock = defineBlock('itap:health-chart', {
  texts: {
    label: 'Health over 24 hours',
    none: 'No health samples in the last 24 hours.',
    cpu: 'CPU',
    memory: 'Memory',
    latency: 'Latency',
    frameRate: 'Frame rate',
    unitPercent: '{{value}} %',
    unitMs: '{{value}} ms',
    unitFps: '{{value}} fps',
    latest: 'latest {{value}}',
    range: 'min {{min}} · max {{max}}',
    point: '{{time}}: {{value}}',
    errors: 'Failed checks',
    errorsHint: 'Red marks: periods with a failed check (unreachable or no frame).',
    errorsTotal: 'Failed checks in the last 24 hours: {{count}}',
    errorsStrip: 'Periods with a failed check over the last 24 hours',
    noMeasures: 'The device reported no measurements in the last 24 hours: every check failed.',
    chart: '{{measure}} over the last 24 hours',
    ago: '24 h ago',
    now: 'now',
  },
  props: {
    deviceId: prop(z.string().nullable().optional()).default(null),
  },
  data: {
    series: ({ props }) =>
      props.deviceId ? source.query(deviceHealthSeries, { deviceId: props.deviceId }) : absent(),
  },
});
