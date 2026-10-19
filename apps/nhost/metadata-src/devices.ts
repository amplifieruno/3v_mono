import type { TableSpec } from './types.js';

export const deviceTables: TableSpec[] = [
  { name: 'access_point_kinds', isEnum: true, profile: 'none' },
  { name: 'access_point_directions', isEnum: true, profile: 'none' },
  { name: 'device_types', isEnum: true, profile: 'none' },
  { name: 'device_statuses', isEnum: true, profile: 'none' },
  { name: 'device_health_statuses', isEnum: true, profile: 'none' },
  { name: 'access_point_device_roles', isEnum: true, profile: 'none' },
  {
    // Lifecycle by status: deleting an access point drops its device bindings; an area it references blocks the area.
    name: 'access_points',
    profile: 'tenant_crud',
    insertOnlyColumns: ['facility_id'],
  },
  {
    // Lifecycle by status: a device that anything references cannot be deleted. Credentials: password is a secret
    // column (writable, never selectable, redacted in audit). Health and policy-sync columns are written by the
    // backend (health check cron, terminal sync).
    name: 'devices',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'health_status', 'last_seen_at', 'policy_version_synced', 'policy_synced_at'],
    insertOnlyColumns: ['facility_id'],
    secretColumns: ['password'],
  },
  { name: 'device_areas', profile: 'tenant_crud', insertOnlyColumns: ['facility_id', 'device_id', 'area_id'] },
  {
    name: 'access_point_devices',
    profile: 'tenant_crud',
    insertOnlyColumns: ['facility_id', 'access_point_id', 'device_id'],
  },
  { name: 'facility_templates', profile: 'tenant_crud' },
];
