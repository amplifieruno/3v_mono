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
  // Written only by the override functions / cron (task 4).
  { name: 'emergency_overrides', profile: 'tenant_read' },
  { name: 'emergency_override_areas', profile: 'tenant_read' },
  // Append-only decision log written by the engine; not audited (high volume).
  { name: 'access_decisions', profile: 'tenant_read' },
];

export const accessFunctions: FunctionSpec[] = [
  'create_access_policy_draft',
  'submit_access_policy_version',
  'approve_access_policy_version',
  'reject_access_policy_version',
  'archive_access_policy',
  'revoke_access_grant',
  // Decision engine (task 2): evaluates at now() and records the decision + access_granted/access_denied event.
  'check_access',
].map((name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }));
