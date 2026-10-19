import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const SESSION_USER = 'X-Hasura-User-Id';
// Profile jobs are organization operations; bulk_search jobs (search history) are their owner's only.
const visibleJob: BoolExp = {
  _and: [ownOrganizationRow, { _or: [{ kind: { _neq: 'bulk_search' } }, { owner_id: { _eq: SESSION_USER } }] }],
};
// Rows carry private_owner_id (bulk_search jobs) instead of a relationship filter: an EXISTS over bulk_jobs around
// the row-writing mutation functions lets Postgres skip executing them.
const visibleJobRow: BoolExp = {
  _and: [ownOrganizationRow, { _or: [{ private_owner_id: { _is_null: true } }, { private_owner_id: { _eq: SESSION_USER } }] }],
};

const JOB_COLUMNS = [
  'attempts', 'attempts_at_retry', 'code', 'completed_at', 'created_at', 'error', 'errors', 'failed', 'id',
  'input_file_id', 'kind', 'lease_expires_at', 'number', 'options', 'organization_id', 'owner_id', 'processed',
  'result_file_id', 'skipped', 'started_at', 'status', 'succeeded', 'total', 'updated_at',
];
const ROW_COLUMNS = [
  'bulk_job_id', 'confidence', 'created_at', 'entity_code', 'error', 'id', 'identity_id', 'label', 'organization_id',
  'outcome', 'private_owner_id', 'profile_id', 'row_no', 'search_request_id', 'updated_at',
];

/**
 * Bulk jobs (spec §6.11, §8.4 run_bulk_job): org_admin inserts a job (kind, input_file_id, options; owner from the
 * session); everything else is system-managed (run_bulk_job trigger -> backend, resume_bulk_jobs cron) and changes
 * only through retry_bulk_job / cancel_bulk_job. Jobs are history (no delete).
 */
export const bulkTables: TableSpec[] = [
  { name: 'bulk_job_kinds', isEnum: true, profile: 'none' },
  { name: 'bulk_job_statuses', isEnum: true, profile: 'none' },
  { name: 'bulk_job_row_outcomes', isEnum: true, profile: 'none' },
  {
    name: 'bulk_jobs',
    profile: 'tenant_read',
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['input_file_id', 'kind', 'options'],
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', owner_id: 'x-hasura-user-id' },
          },
        },
      ],
      select_permissions: [{ role: ORG_ADMIN, permission: { columns: JOB_COLUMNS, filter: visibleJob, allow_aggregations: true } }],
    },
    eventTriggers: [
      {
        // Fires on insert and on status changes; the handler starts only `queued` jobs (new, or requeued by
        // retry_bulk_job) and claims them with a lease, so redeliveries and other status updates are no-ops.
        name: 'run_bulk_job',
        operations: ['insert', 'update'],
        columns: ['status'],
        retry: { num_retries: 3, retry_interval_seconds: 30, timeout_seconds: 60 },
      },
    ],
  },
  {
    name: 'bulk_job_rows',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [{ role: ORG_ADMIN, permission: { columns: ROW_COLUMNS, filter: visibleJobRow, allow_aggregations: true } }],
    },
  },
];

export const bulkFunctions: FunctionSpec[] = [
  ...['claim_bulk_job', 'bulk_job_progress', 'record_bulk_job_row', 'complete_bulk_job', 'fail_bulk_job'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', roles: [] }),
  ),
  { name: 'due_bulk_jobs', exposedAs: 'query', roles: [] },
  // Called by the backend as the job owner (role org_admin) so the owner's organization scopes the row.
  ...['bulk_apply_profile_row', 'retry_bulk_job', 'cancel_bulk_job'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
];
