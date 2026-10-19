import type { TableSpec } from './types.js';

/**
 * Detections and tracking state (spec §6.8). All four tables are system-written (recognition pipeline, Stage A
 * itap.track_detection, stale-session cron): read-only for org_admin, not audited.
 */
export const trackingTables: TableSpec[] = [
  { name: 'tracking_session_statuses', isEnum: true, profile: 'none' },
  { name: 'movement_types', isEnum: true, profile: 'none' },
  // Append-only; inserted by the recognition pipeline with the admin secret.
  { name: 'detections', profile: 'tenant_read' },
  { name: 'tracking_sessions', profile: 'tenant_read' },
  { name: 'identity_locations', profile: 'tenant_read' },
  { name: 'area_occupancy', profile: 'tenant_read' },
];
