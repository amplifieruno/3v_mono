import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { DEVICE_HEALTH_METRIC_RESOURCE, DEVICE_RESOURCE } from '../../data/resource-names';

/** Page size of the health-sample lists (a camera writes one sample a minute). */
export const HEALTH_LOG_PAGE_SIZE = 50;

const shown = ['list', 'show'] as const;

/** Columns of `itap.device_health_metrics` the `org_admin` role reads; all written by the health check. */
export const deviceHealthMetricFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  device_id: f.relation({
    to: DEVICE_RESOURCE,
    system: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'device' },
    texts: { label: 'Device', doc: { summary: 'The device the sample was taken of.' } },
  }),
  recorded_at: f.dateTime({
    system: true,
    in: [...shown],
    texts: {
      label: 'Checked at',
      doc: { summary: 'When the health check took the sample; one sample per device and check.' },
    },
  }),
  cpu_usage: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'CPU %',
      doc: {
        summary:
          'Processor load reported by the device, 0 to 100. Empty for cameras, which are probed through the stream server and report no host figures.',
      },
    },
  }),
  memory_usage: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Memory %',
      doc: { summary: 'Memory in use reported by the device, 0 to 100; empty for cameras.' },
    },
  }),
  disk_usage: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Disk %',
      doc: { summary: 'Storage in use reported by the device, 0 to 100; empty for cameras.' },
    },
  }),
  network_latency_ms: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Latency (ms)',
      doc: {
        summary:
          'How long the device (a camera: its stream snapshot) took to answer the check, in milliseconds; empty when it did not answer.',
      },
    },
  }),
  frame_rate: f.number({
    system: true,
    nullable: true,
    in: [...shown],
    texts: {
      label: 'Frame rate',
      doc: { summary: 'Frames per second measured on the stream; empty when the check does not measure it.' },
    },
  }),
  error_count: f.number({
    system: true,
    integer: true,
    in: [...shown],
    texts: {
      label: 'Errors',
      doc: {
        summary:
          'Problems found by this check: 0 when the device was healthy, 1 when it was unreachable or delivered no frame.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};

/**
 * Device health samples (`itap.device_health_metrics`): one row per device and health check,
 * written by the platform only. An append-only log: no create, edit or delete, no count on
 * every page (`count: 'manual'`, the mapping's `noAggregate`) and keyset paging, newest first.
 */
export const deviceHealthMetric = defineResource(DEVICE_HEALTH_METRIC_RESOURCE, {
  texts: {
    label: 'Health sample',
    labelPlural: 'Device health',
    doc: {
      summary:
        'One result of the device health check: whether the device answered, how fast, and its load where the device reports it.',
    },
  },
  basePath: '/device-health',
  section: NAV_SECTIONS.devices,
  order: 30,
  icon: NAV_ICONS.deviceHealth,
  displayField: 'recorded_at',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: deviceHealthMetricFields,
  views: {
    list: {
      columns: ['recorded_at', 'device_id', 'network_latency_ms', 'error_count', 'cpu_usage', 'memory_usage'],
      optionalColumns: ['disk_usage', 'frame_rate'],
      defaultSort: [{ field: 'recorded_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: HEALTH_LOG_PAGE_SIZE,
      filters: { fields: ['device_id', 'recorded_at', 'error_count'] },
    },
    show: { page: false },
  },
});
