import type { FunctionSpec, TableSpec } from './types.js';

/**
 * Detections and tracking state (spec §6.8). All four tables are system-written (recognition pipeline, Stage A
 * itap.track_detection, stale-session cron): read-only for org_admin, not audited.
 */
export const trackingTables: TableSpec[] = [
  { name: 'tracking_session_statuses', isEnum: true, profile: 'none' },
  { name: 'movement_types', isEnum: true, profile: 'none' },
  {
    // Append-only; inserted by the recognition pipeline with the admin secret. Stage B (spec §8.2) runs after
    // commit: detection_created -> backend /hasura/events/detection_created -> itap.evaluate_detection (idempotent,
    // so Hasura's at-least-once redelivery writes nothing twice).
    name: 'detections',
    profile: 'tenant_read',
    eventTriggers: [
      { name: 'detection_created', operations: ['insert'], retry: { num_retries: 5, retry_interval_seconds: 5, timeout_seconds: 30 } },
    ],
  },
  { name: 'tracking_sessions', profile: 'tenant_read' },
  { name: 'identity_locations', profile: 'tenant_read' },
  { name: 'area_occupancy', profile: 'tenant_read' },
];

/** Stage B and the tracking crons: admin secret only (called by the backend trigger handlers). */
export const trackingFunctions: FunctionSpec[] = [
  {
    name: 'evaluate_detection',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: Stage B, called by the detection_created event trigger handler and the seed',
  },
  {
    name: 'evaluate_dwell_rules',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: called per organization by the evaluate_dwell_rules cron handler',
  },
  {
    name: 'close_stale_sessions',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: called per organization by the close_stale_sessions cron handler',
  },
];
