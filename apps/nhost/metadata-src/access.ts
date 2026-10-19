import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

/** Physical access control (spec §6.13, slice 8): versioned policies with approval, grants, overrides, decisions. */
export const accessTables: TableSpec[] = [
  { name: 'access_effects', isEnum: true, profile: 'none' },
  { name: 'override_modes', isEnum: true, profile: 'none' },
  { name: 'access_decision_results', isEnum: true, profile: 'none' },
  { name: 'access_decision_reasons', isEnum: true, profile: 'none' },
  {
    // Versioned header: current_version_id only via approve_access_policy_version, is_archived / archived_* only
    // via archive_access_policy. An enforced policy cannot be deleted (archive it first).
    name: 'access_policies',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'current_version_id', 'is_archived', 'archived_at', 'archived_by'],
    relationshipNames: { access_policies_current_version_fkey: 'current_version' },
    extraPermissions: {
      delete_permissions: [
        { role: ORG_ADMIN, permission: { filter: { _and: [ownOrganizationRow, { current_version_id: { _is_null: true } }] } } },
      ],
    },
  },
  {
    // Status and approval columns only via submit / approve / reject (guards); published/superseded and pending
    // versions are frozen. Only drafts can be deleted.
    name: 'access_policy_versions',
    profile: 'tenant_crud',
    readOnlyColumns: [
      'version',
      'status',
      'submitted_by',
      'submitted_at',
      'approved_by',
      'approved_at',
      'rejection_reason',
      'rejected_by',
      'rejected_at',
      'published_by',
      'published_at',
    ],
    insertOnlyColumns: ['policy_id'],
    relationshipNames: { access_policies_current_version_fkey: 'current_of_policies' },
    extraPermissions: {
      delete_permissions: [
        { role: ORG_ADMIN, permission: { filter: { _and: [ownOrganizationRow, { status: { _eq: 'draft' } }] } } },
      ],
    },
  },
  // Children of a version: editable only while the version is a draft (guard triggers).
  { name: 'access_policy_version_subjects', profile: 'tenant_crud', insertOnlyColumns: ['version_id'] },
  { name: 'access_policy_version_targets', profile: 'tenant_crud', insertOnlyColumns: ['version_id'] },
  {
    // Insert + select for org_admin; revoked via revoke_access_grant; used_at written by check_access.
    name: 'access_grants',
    profile: 'tenant_read',
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['profile_id', 'area_id', 'access_point_id', 'valid_from', 'valid_until', 'single_use', 'reason'],
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id' },
          },
        },
      ],
    },
  },
  // Written only by start_emergency_override / end_emergency_override and the end_emergency_overrides cron.
  { name: 'emergency_overrides', profile: 'tenant_read' },
  { name: 'emergency_override_areas', profile: 'tenant_read' },
  // Append-only decision log written by the engine; not audited (high volume).
  { name: 'access_decisions', profile: 'tenant_read' },
  // Terminal policy distribution (task 4): push log written by record_terminal_sync (ro, not audited).
  { name: 'terminal_sync_results', isEnum: true, profile: 'none' },
  { name: 'terminal_policy_syncs', profile: 'tenant_read' },
  // One row per urgent policy epoch (bump_policy_epoch); convergence is measured from the earliest unapplied one.
  { name: 'policy_urgent_epochs', profile: 'tenant_read' },
  // Row types of the admin-only distribution functions (backend sync); store nothing.
  { name: 'terminal_policy_payloads', schema: 'itap_results', profile: 'none' },
  { name: 'terminal_sync_targets', schema: 'itap_results', profile: 'none' },
  // Row types of the org_admin query functions; store nothing, rows only through the functions.
  resultTable('terminal_sync_status_rows', [
    'access_point_ids', 'bound_seconds', 'device_id', 'device_name', 'epoch', 'epoch_lag', 'facility_id',
    'health_status', 'reachable', 'seconds_since_urgent', 'status', 'sync_error', 'synced_at', 'synced_epoch',
    'urgent_at', 'urgent_epoch', 'urgent_pending', 'within_bound',
  ]),
  resultTable('access_policy_simulations', [
    'decisions_in_period', 'denied_to_granted', 'drifted', 'evaluated', 'granted_to_denied', 'period_from', 'period_to',
    'policy_id', 'reason_changed', 'sampled', 'samples', 'skipped', 'unchanged', 'version_id',
  ]),
  resultTable('policy_analytics_rows', [
    'complexity', 'decisions', 'denial_reasons', 'denied', 'granted', 'grants', 'overlap_hints', 'period_from',
    'period_to', 'top_denied', 'unused_versions', 'versions',
  ]),
];

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

const adminOnly = (name: string, exposedAs: 'query' | 'mutation', reason: string): FunctionSpec => ({
  name,
  exposedAs,
  roles: [],
  unscopedReturnReason: `admin-only: ${reason}`,
});

export const accessFunctions: FunctionSpec[] = [
  'create_access_policy_draft',
  'submit_access_policy_version',
  'approve_access_policy_version',
  'reject_access_policy_version',
  'archive_access_policy',
  'revoke_access_grant',
  // Decision engine (task 2): evaluates at now() and records the decision + access_granted/access_denied event.
  'check_access',
  // Emergency overrides (task 4): active members only; events emergency_override_started / _ended.
  'start_emergency_override',
  'end_emergency_override',
].map((name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }));

/** Task 4: convergence report, simulation and analytics (org_admin queries) and the backend-only distribution. */
export const accessOperationFunctions: FunctionSpec[] = [
  ...['terminal_sync_status', 'simulate_access_policy', 'policy_analytics'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
  adminOnly('end_emergency_overrides', 'mutation', 'called per organization by the end_emergency_overrides cron handler'),
  adminOnly('terminal_policy_payload', 'query', 'terminal sync (cron, urgent-bump trigger, publish_policy_to_terminals)'),
  adminOnly('terminals_due_for_sync', 'query', 'terminal sync across all organizations'),
  adminOnly('record_terminal_sync', 'mutation', 'terminal sync stub transport records each push'),
];
