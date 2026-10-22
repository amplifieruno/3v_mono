import { defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  ACCESS_POINT_DEVICE_RESOURCE,
  DEVICE_AREA_RESOURCE,
  DEVICE_RESOURCE,
} from '../../data/resource-names';
import { CAMERA_DEVICE_TYPES } from '../../enums/devices';
import { deviceFields } from './device-fields';
import { CAMERA_FIELD_NAMES, TERMINAL_FIELD_NAMES } from './device-type-fields';

/** How often the device list re-reads: the health check writes every minute. */
export const DEVICE_LIST_REFETCH_MS = 30_000;

/** The keyed panels only one kind of device has (hidden from the others with `without.nodes`). */
const STREAM_PANEL = 'stream';
const POLICY_PANEL = 'policy';

/**
 * Devices: the cameras, access terminals and sensors of each facility, with their place on the
 * floor plan, health, credentials and the areas and access points they serve. One record type
 * per device type (`types` over `device_type`): cameras carry the stream and recognition,
 * terminals the policy sync, sensors neither. The sidebar facility picker narrows the list
 * (`data.scope`), and the list re-reads every 30 s for the health check's changes.
 */
export const device = defineResource(DEVICE_RESOURCE, {
  texts: {
    label: 'Device',
    labelPlural: 'Devices',
    doc: {
      summary:
        'A camera, access terminal or sensor installed in a facility: where it is, what it covers, how to reach it and whether it is healthy.',
    },
  },
  basePath: '/devices',
  section: NAV_SECTIONS.devices,
  order: 10,
  icon: NAV_ICONS.devices,
  displayField: 'name',
  data: { provider: 'hasura', scope: { facility: { field: 'facility_id' } } },
  prefill: { fromQuery: ['facility_id', 'area_id'] },
  fields: deviceFields,
  types: {
    by: 'device_type',
    items: (t) => {
      const camera = () =>
        t.type({ without: { fields: TERMINAL_FIELD_NAMES, nodes: [POLICY_PANEL] } });
      return {
        ...Object.fromEntries(CAMERA_DEVICE_TYPES.map((type) => [type, camera()])),
        access_terminal: t.type({ without: { fields: CAMERA_FIELD_NAMES, nodes: [STREAM_PANEL] } }),
        sensor: t.type({
          without: {
            fields: [...CAMERA_FIELD_NAMES, ...TERMINAL_FIELD_NAMES],
            nodes: [STREAM_PANEL, POLICY_PANEL],
          },
        }),
      };
    },
  },
  views: {
    list: {
      columns: ['code', 'name', 'device_type', 'facility_id', 'area_id', 'status', 'health_status', 'last_seen_at'],
      optionalColumns: ['manufacturer', 'model', 'ip_address', 'recognition_enabled', 'policy_synced_at'],
      defaultSort: [{ field: 'name', direction: 'asc' }],
      search: { fields: ['name', 'code', 'manufacturer', 'model'] },
      filters: { fields: ['device_type', 'status', 'health_status', 'facility_id', 'area_id'] },
      savedViews: [
        {
          id: 'offline',
          texts: 'Offline',
          state: { filters: [{ field: 'health_status', op: 'eq', value: 'critical' }] },
        },
        {
          id: 'cameras',
          texts: 'Cameras',
          state: { filters: [{ field: 'device_type', op: 'in', value: [...CAMERA_DEVICE_TYPES] }] },
        },
      ],
      refetchInterval: DEVICE_LIST_REFETCH_MS,
    },
    show: {
      header: (l) => [l.grid(['device_type', 'status', 'health_status', 'last_seen_at'])],
      body: (l) => [
        l.tabs(
          [
            l.panel(
              [
                l.grid(['name', 'code', 'facility_id', 'area_id']),
                l.grid(['also_covers', 'access_points']),
                l.grid(['manufacturer', 'model', 'firmware_version', 'ip_address', 'username']),
                'position',
                'coverage',
                'configuration',
                'custom_fields',
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                'stream_url',
                l.grid(['resolution', 'fps', 'recognition_enabled', 'recognition_fps']),
              ],
              { key: STREAM_PANEL, texts: 'Stream' },
            ),
            l.panel(
              [l.grid(['policy_version_synced', 'policy_synced_at']), 'policy_sync_error'],
              { key: POLICY_PANEL, texts: 'Access policies' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(DEVICE_AREA_RESOURCE)), {
                  key: 'covered-areas',
                  props: {
                    // Both keys seed "+ Create": a covered area carries its device's facility.
                    where: [
                      { field: 'device_id', op: 'eq', value: l.ref('record', 'id') },
                      { field: 'facility_id', op: 'eq', value: l.ref('record', 'facility_id') },
                    ],
                    columns: ['area_id', 'created_at'],
                    open: 'none',
                  },
                }),
              ],
              { key: 'areas', texts: 'Areas' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(ACCESS_POINT_DEVICE_RESOURCE)), {
                  key: 'bound-access-points',
                  props: {
                    where: [
                      { field: 'device_id', op: 'eq', value: l.ref('record', 'id') },
                      { field: 'facility_id', op: 'eq', value: l.ref('record', 'facility_id') },
                    ],
                    columns: ['access_point_id', 'role', 'created_at'],
                    open: 'none',
                  },
                }),
              ],
              { key: 'access-points', texts: 'Access points' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        l.grid(['device_type', 'facility_id', 'name', 'status']),
        'area_id',
        l.grid(['manufacturer', 'model', 'firmware_version', 'ip_address']),
        l.panel(['stream_url', l.grid(['resolution', 'fps', 'recognition_fps'])], {
          key: STREAM_PANEL,
          texts: 'Stream',
        }),
        l.panel([l.grid(['username', 'password'])], { key: 'credentials', texts: 'Credentials' }),
        'position',
        'coverage',
        'configuration',
        'custom_fields',
      ],
    },
  },
});
