import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const INTEGRATION_WRITABLE = ['name', 'description', 'provider', 'config', 'field_mapping', 'direction', 'status'];
const EXPORT_DEFINITION_WRITABLE = [
  'name', 'description', 'entity', 'format', 'filters', 'mode', 'schedule_cron', 'timezone', 'is_active', 'max_rows',
];
const ownedDefinition: BoolExp = { _and: [ownOrganizationRow, { owner_id: { _eq: 'X-Hasura-User-Id' } }] };

/** Compliance, governance and integrations (spec §6.14, §6.15, SA_4; slice 10). */
export const complianceTables: TableSpec[] = [
  { name: 'retention_data_classes', isEnum: true, profile: 'none' },
  { name: 'retention_actions', isEnum: true, profile: 'none' },
  { name: 'retention_run_statuses', isEnum: true, profile: 'none' },
  { name: 'dsr_types', isEnum: true, profile: 'none' },
  { name: 'dsr_statuses', isEnum: true, profile: 'none' },
  { name: 'dpia_statuses', isEnum: true, profile: 'none' },
  { name: 'legal_bases', isEnum: true, profile: 'none' },
  { name: 'integration_kinds', isEnum: true, profile: 'none' },
  { name: 'integration_statuses', isEnum: true, profile: 'none' },
  { name: 'integration_directions', isEnum: true, profile: 'none' },
  { name: 'export_formats', isEnum: true, profile: 'none' },
  { name: 'export_modes', isEnum: true, profile: 'none' },
  { name: 'export_job_statuses', isEnum: true, profile: 'none' },
  // Class / facility dimension / action validated by CHECKs; one active policy per (class, facility).
  { name: 'retention_policies', profile: 'tenant_crud' },
  {
    // Ended with ends_at, never deleted (audited evidence); targets are insert / delete only.
    name: 'legal_holds',
    profile: 'tenant_crud',
    noDelete: true,
    relationshipNames: { legal_hold_targets_hold_fkey: 'targets' },
  },
  {
    name: 'legal_hold_targets',
    profile: 'tenant_crud',
    insertOnlyColumns: ['hold_id', 'identity_id', 'profile_id', 'incident_id', 'facility_id'],
  },
  {
    // org_admin files the request (requested_by stamped from the session; details = the requested changes of a
    // rectification) and edits notes; the fulfil_dsr job owns status, completion, partial, the export bundle, the SLA
    // mark and the lease columns; reject_dsr / complete_dsr / retry_dsr close or requeue. Records of compliance: no
    // delete.
    name: 'data_subject_requests',
    profile: 'tenant_crud',
    noDelete: true,
    readOnlyColumns: [
      'number', 'status', 'completed_at', 'export_file_id', 'rejection_reason', 'requested_by', 'attempts',
      'attempts_at_retry', 'lease_expires_at', 'last_error', 'partial', 'outcome', 'overdue_notified_at',
    ],
    insertOnlyColumns: ['profile_id', 'request_type', 'received_at', 'due_at', 'details'],
    relationshipNames: { dsr_steps_request_fkey: 'steps' },
    eventTriggers: [
      {
        // Insert, and requeue by retry_dsr (attempts_at_retry); the handler claims with a lease, so redeliveries are
        // no-ops; the dsr_maintenance cron reclaims expired leases.
        name: 'fulfil_dsr',
        operations: ['insert', 'update'],
        columns: ['attempts_at_retry'],
        retry: { num_retries: 3, retry_interval_seconds: 60, timeout_seconds: 300 },
      },
    ],
  },
  // Step log written by the DSR job.
  { name: 'dsr_steps', profile: 'tenant_read' },
  {
    name: 'processing_activities',
    profile: 'tenant_crud',
    readOnlyColumns: ['number'],
    relationshipNames: { processing_activity_data_classes_activity_fkey: 'data_classes' },
  },
  { name: 'processing_activity_data_classes', profile: 'tenant_crud', insertOnlyColumns: ['activity_id', 'data_class'] },
  // Written by the retention engine (task 2).
  { name: 'retention_runs', profile: 'tenant_read', relationshipNames: { retention_run_classes_run_fkey: 'classes' } },
  { name: 'retention_run_classes', profile: 'tenant_read' },
  // Internal storage deletion queue (retention / DSR drain it through the backend).
  { name: 'pending_file_deletions', profile: 'none' },
  {
    // secret: AES-256-GCM ciphertext (AAD = integration id) written only by the action set_integration_secret, never
    // selectable; status error is system-only (trigger integrations_status_guard); last_sync_at / last_error: sync job.
    name: 'integrations',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'last_sync_at', 'last_error', 'next_sync_at'],
    relationshipNames: { integration_sync_runs_integration_fkey: 'sync_runs' },
    insertOnlyColumns: ['kind'],
    secretColumns: ['secret'],
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['kind', ...INTEGRATION_WRITABLE],
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', created_by: 'x-hasura-user-id' },
          },
        },
      ],
      update_permissions: [{ role: ORG_ADMIN, permission: { columns: INTEGRATION_WRITABLE, filter: ownOrganizationRow } }],
    },
  },
  {
    // Sync log (run_integration_sync action / run_integration_schedules cron insert, the run_sync job writes). The
    // event payload carries only the run's identifiers (never integration columns; the secret is never in a payload).
    name: 'integration_sync_runs',
    profile: 'tenant_read',
    relationshipNames: { integration_sync_runs_integration_fkey: 'integration' },
    eventTriggers: [
      {
        name: 'run_sync',
        operations: ['insert'],
        payloadColumns: ['id', 'organization_id', 'integration_id', 'trigger'],
        retry: { num_retries: 3, retry_interval_seconds: 60, timeout_seconds: 300 },
      },
    ],
  },
  // Erasure suppression keys (sha256 of integration + external id) read by the HR sync; backend only.
  { name: 'integration_suppressions', profile: 'none' },
  { name: 'export_entities', isEnum: true, profile: 'none' },
  {
    // The owner (session member) edits, deletes and runs a definition (jobs run with the owner's permissions);
    // every org_admin sees them. watermark / schedule bookkeeping: system columns.
    name: 'export_definitions',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'watermark', 'watermark_id', 'next_run_at', 'last_run_at', 'last_error', 'last_failed_at', 'owner_id'],
    relationshipNames: { export_jobs_definition_fkey: 'jobs' },
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: EXPORT_DEFINITION_WRITABLE,
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', owner_id: 'x-hasura-user-id' },
          },
        },
      ],
      update_permissions: [{ role: ORG_ADMIN, permission: { columns: EXPORT_DEFINITION_WRITABLE, filter: ownedDefinition, check: ownedDefinition } }],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownedDefinition } }],
    },
  },
  {
    // org_admin requests a job of their own definition (definition_id only; requested_by from the session); the
    // run_export job writes the rest. Jobs are history (no update / delete).
    name: 'export_jobs',
    profile: 'tenant_read',
    relationshipNames: { export_jobs_definition_fkey: 'definition' },
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['definition_id'],
            check: { _and: [ownOrganizationRow, { definition: { owner_id: { _eq: 'X-Hasura-User-Id' } } }] },
            set: { organization_id: 'x-hasura-organization-id', requested_by: 'x-hasura-user-id' },
          },
        },
      ],
    },
    eventTriggers: [
      {
        name: 'run_export',
        operations: ['insert'],
        payloadColumns: ['id', 'organization_id', 'definition_id'],
        retry: { num_retries: 3, retry_interval_seconds: 60, timeout_seconds: 300 },
      },
    ],
  },
  // Row type of itap.system_status (backend only, get_system_status); stores nothing.
  { name: 'system_status_snapshots', schema: 'itap_results', profile: 'none' },
  // Row type of itap.dsr_bundle (backend only); stores nothing.
  { name: 'dsr_bundles', schema: 'itap_results', profile: 'none' },
  // Row type of itap.match_face_suppressed (backend only); stores nothing.
  { name: 'face_suppressions', schema: 'itap_results', profile: 'none' },
  {
    // Row type of the org_admin dry run itap.retention_plan; stores nothing, rows only through the function.
    name: 'retention_plan_rows',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: [
              'action', 'candidates', 'cutoff', 'data_class', 'facility_id', 'held', 'organization_id', 'policy_id',
              'retain_days',
            ],
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
];

export const complianceFunctions: FunctionSpec[] = [
  { name: 'set_processing_restriction', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  // Backend only (recognition, enrollment): faces of restricted / consent-withdrawn people are dropped.
  {
    name: 'match_face_suppressed',
    exposedAs: 'query',
    sessionArgument: 'hasura_session',
    roles: [],
    unscopedReturnReason: 'admin-only: backend recognition and enrollment with the organization session',
  },
  // Retention (task 2): dry run for org_admin; the runner is called per organization by the retention_cleanup cron.
  { name: 'retention_plan', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  {
    name: 'run_retention',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: called per organization by the retention_cleanup cron handler',
  },
  // DSR (task 3): org_admin closes / requeues requests; the fulfil_dsr job functions are admin-only.
  { name: 'reject_dsr', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  { name: 'complete_dsr', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  { name: 'retry_dsr', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  ...['claim_dsr', 'fail_dsr', 'dsr_restrict', 'dsr_erase_restrict', 'dsr_await_rectification', 'dsr_bundle', 'complete_dsr_export', 'dsr_erase',
    'dsr_overdue_events'].map(
    (name): FunctionSpec => ({
      name,
      exposedAs: 'mutation',
      roles: [],
      unscopedReturnReason: 'admin-only: the fulfil_dsr job and the dsr_maintenance cron',
    }),
  ),
  {
    name: 'due_dsrs',
    exposedAs: 'query',
    roles: [],
    unscopedReturnReason: 'admin-only: the dsr_maintenance cron across organizations',
  },
  // Integrations and exports (task 4): job / cron functions, admin-only.
  ...['request_integration_sync', 'claim_integration_sync', 'complete_integration_sync', 'fail_integration_sync',
    'init_integration_schedule', 'run_integration_schedule', 'renew_integration_sync_lease', 'claim_export_job', 'complete_export_job', 'fail_export_job',
    'init_export_definition', 'run_export_definition', 'record_export_definition_failure'].map(
    (name): FunctionSpec => ({
      name,
      exposedAs: 'mutation',
      roles: [],
      unscopedReturnReason: 'admin-only: the run_sync / run_export jobs, their crons and the run_integration_sync action',
    }),
  ),
  ...['due_integration_syncs', 'due_export_jobs', 'system_status'].map(
    (name): FunctionSpec => ({
      name,
      exposedAs: 'query',
      roles: [],
      unscopedReturnReason: 'admin-only: crons across organizations and the get_system_status action (organization argument)',
    }),
  ),
  {
    name: 'claim_file_deletions',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: the storage deletion drain (retention_cleanup, drain_file_deletions crons)',
  },
  {
    name: 'enqueue_stale_face_sources',
    exposedAs: 'mutation',
    roles: [],
    unscopedReturnReason: 'admin-only: the drain_file_deletions cron queues unused face_source uploads of every organization',
  },
];
