import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { DEVICE_EVENT_RESOURCE, DEVICE_RESOURCE } from '../../data/resource-names';
import { DEVICE_EVENT_KINDS, DEVICE_EVENT_KIND_ENUM } from '../../enums/devices';
import { enumField } from '../../enums/field';

/** Page size of the device event lists. */
export const DEVICE_EVENT_PAGE_SIZE = 25;

const shown = ['list', 'show'] as const;

/** Columns of `itap.device_events` the `org_admin` role reads; all written by the platform. */
export const deviceEventFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  occurred_at: f.dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'When', doc: { summary: 'When it happened on the device (the check time for health changes).' } },
  }),
  kind: enumField(DEVICE_EVENT_KINDS, DEVICE_EVENT_KIND_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Event',
      doc: {
        summary:
          'What happened: offline, back online or no frames (written by the health check when the device’s health changes), or a configuration change, reboot or firmware update.',
      },
    },
  }),
  device_id: f.relation({
    to: DEVICE_RESOURCE,
    system: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'device' },
    texts: { label: 'Device', doc: { summary: 'The device it happened on.' } },
  }),
  message: f.string({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Message', doc: { summary: 'The platform’s description of the event.' } },
  }),
  payload: f.json({
    system: true,
    in: ['show'],
    texts: {
      label: 'Details',
      doc: {
        summary:
          'Machine-readable facts of the event, such as the previous health or the measured latency.',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Stored', in: ['show'] }),
};

/**
 * Device events (`itap.device_events`): what happened on a device, newest first, drawn as a
 * timeline. Written by the platform only, an append-only log: no create, edit or delete, no
 * count on every page (`count: 'manual'`, the mapping's `noAggregate`) and keyset paging.
 */
export const deviceEvent = defineResource(DEVICE_EVENT_RESOURCE, {
  texts: {
    label: 'Device event',
    labelPlural: 'Device events',
    doc: {
      summary:
        'A change on a device recorded by the platform: it went offline, came back, stopped delivering frames, or was reconfigured, rebooted or updated.',
    },
  },
  basePath: '/device-events',
  section: NAV_SECTIONS.devices,
  order: 40,
  icon: NAV_ICONS.deviceEvents,
  displayField: 'message',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: deviceEventFields,
  views: {
    list: {
      view: 'timeline',
      columns: ['kind', 'device_id', 'message', 'occurred_at'],
      defaultSort: [{ field: 'occurred_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      pagination: 'cursor',
      count: 'manual',
      pageSize: DEVICE_EVENT_PAGE_SIZE,
      search: { fields: [{ field: 'message', op: 'contains' }] },
      filters: { pinned: ['kind'], fields: ['kind', 'device_id', 'occurred_at'] },
    },
    show: { page: false },
  },
});
