import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

/** Row type of a query function: org_admin selects it only through the function (root fields hidden). */
function resultTable(name: string, columns: string[]): TableSpec {
  return {
    name,
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['organization_id', ...columns].sort(),
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  };
}

/**
 * Analytics (spec §6.10, §8.1): stats tables written only by itap.aggregate_stats(_range) (read-only for
 * org_admin, not audited) and the query functions over them.
 */
export const analyticsTables: TableSpec[] = [
  { name: 'area_hourly_stats', profile: 'tenant_read' },
  { name: 'facility_daily_stats', profile: 'tenant_read' },
  { name: 'area_transitions_daily', profile: 'tenant_read' },
  // Row type of itap.aggregate_stats / aggregate_stats_range (admin secret only; stores nothing).
  { name: 'stats_aggregations', schema: 'itap_results', profile: 'none' },
  resultTable('facility_occupancy_rows', ['area_id', 'capacity', 'direct_occupancy', 'facility_id', 'name', 'occupancy', 'parent_id']),
  resultTable('occupancy_series_rows', [
    'avg_dwell_seconds', 'bucket_start', 'day', 'dwell_seconds', 'entries', 'exits', 'facility_id', 'peak_occupancy',
    'unique_identities',
  ]),
  resultTable('flow_matrix_rows', ['count', 'facility_id', 'from_area_id', 'to_area_id']),
  resultTable('dashboard_kpi_rows', [
    'as_of', 'current_occupancy', 'deliveries_failed_24h', 'devices_offline', 'local_date', 'open_incidents',
    'open_incidents_critical', 'open_incidents_high', 'open_incidents_info', 'open_incidents_low',
    'open_incidents_medium', 'segment_top_movers', 'unique_visitors_today',
  ]),
  resultTable('identity_timeline_entries', [
    'access_point_id', 'area_id', 'detection_id', 'device_id', 'event_id', 'event_type', 'facility_id', 'identity_id',
    'kind', 'movement_type', 'occurred_at', 'session_id', 'severity', 'status', 'title', 'visit_id',
  ]),
];

/** Aggregation writers (cron handler, seed) and the org_admin query functions. */
export const analyticsFunctions: FunctionSpec[] = [
  { name: 'aggregate_stats', exposedAs: 'mutation', roles: [] },
  { name: 'aggregate_stats_range', exposedAs: 'mutation', roles: [] },
  ...['facility_occupancy_now', 'occupancy_series', 'flow_matrix', 'identity_timeline', 'dashboard_kpis'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
];
