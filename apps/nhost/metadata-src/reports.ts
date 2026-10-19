import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const userEditableTemplate: BoolExp = { _and: [ownOrganizationRow, { is_system: { _eq: false } }] };

/**
 * Reports (spec §6.10, §8.3-8.5): org_admin creates reports (type, format, period, nested targets), templates and
 * schedules; generation columns are system-managed (render_report trigger -> backend); reports are history (no
 * delete); is_system templates are read-only; report_metrics are computed (read-only).
 */
export const reportTables: TableSpec[] = [
  { name: 'report_types', isEnum: true, profile: 'none' },
  { name: 'report_formats', isEnum: true, profile: 'none' },
  { name: 'report_statuses', isEnum: true, profile: 'none' },
  { name: 'report_metric_types', isEnum: true, profile: 'none' },
  {
    name: 'report_templates',
    profile: 'tenant_crud',
    readOnlyColumns: ['is_system'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['description', 'format', 'name', 'parameters', 'report_type'],
            filter: userEditableTemplate,
            check: userEditableTemplate,
          },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: userEditableTemplate } }],
    },
  },
  {
    // next_run_at / last_run_at are written by the run_report_schedules cron.
    name: 'report_schedules',
    profile: 'tenant_crud',
    readOnlyColumns: ['last_run_at', 'next_run_at'],
  },
  {
    // Generation state is system-managed; the report definition is fixed once inserted (only title/description edit).
    name: 'reports',
    profile: 'tenant_crud',
    readOnlyColumns: [
      'number', 'status', 'file_id', 'summary', 'error', 'generated_at', 'attempts', 'lease_expires_at', 'schedule_id',
    ],
    insertOnlyColumns: ['report_type', 'parameters', 'start_date', 'end_date', 'incident_id', 'format', 'template_id'],
    noDelete: true,
    eventTriggers: [
      {
        // Fires on insert and on status changes; the handler acts only on `queued` rows (new or requeued by
        // retry_report) and claims them with a lease, so redeliveries and other status updates are no-ops.
        name: 'render_report',
        operations: ['insert', 'update'],
        columns: ['status'],
        retry: { num_retries: 3, retry_interval_seconds: 30, timeout_seconds: 120 },
      },
    ],
  },
  { name: 'report_facilities', profile: 'tenant_crud', insertOnlyColumns: ['report_id', 'facility_id'] },
  { name: 'report_segments', profile: 'tenant_crud', insertOnlyColumns: ['report_id', 'segment_id'] },
  { name: 'report_metrics', profile: 'tenant_read' },
  // Row type of itap.compute_report (admin secret only; stores nothing).
  { name: 'report_datasets', schema: 'itap_results', profile: 'none' },
];

export const reportFunctions: FunctionSpec[] = [
  ...['claim_report', 'compute_report', 'complete_report', 'fail_report', 'init_report_schedule', 'run_report_schedule'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', roles: [] }),
  ),
  { name: 'due_reports', exposedAs: 'query', roles: [] },
  ...['retry_report', 'generate_incident_report'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
];
