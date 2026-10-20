import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const INTEGRATION_WRITABLE = ['name', 'description', 'provider', 'config', 'field_mapping', 'direction', 'status'];

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
    // org_admin files the request (requested_by stamped from the session) and edits notes; the fulfil_dsr job
    // (task 3) owns status, completion, the export bundle and the lease columns. Records of compliance: no delete.
    name: 'data_subject_requests',
    profile: 'tenant_crud',
    noDelete: true,
    readOnlyColumns: [
      'number', 'status', 'completed_at', 'export_file_id', 'rejection_reason', 'requested_by', 'attempts',
      'attempts_at_retry', 'lease_expires_at', 'last_error',
    ],
    insertOnlyColumns: ['profile_id', 'request_type', 'received_at', 'due_at'],
    relationshipNames: { dsr_steps_request_fkey: 'steps' },
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
    readOnlyColumns: ['number', 'last_sync_at', 'last_error'],
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
  // Row type of itap.match_face_suppressed (backend only); stores nothing.
  { name: 'face_suppressions', schema: 'itap_results', profile: 'none' },
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
];
