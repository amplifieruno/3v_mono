import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const USER = 'user';

const ownOrganization: BoolExp = { id: { _eq: 'X-Hasura-Organization-Id' } };
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const ownUserRow: BoolExp = { user_id: { _eq: 'X-Hasura-User-Id' } };

const ORGANIZATION_COLUMNS = [
  'id',
  'name',
  'slug',
  'legal_name',
  'logo_file_id',
  'timezone',
  'locale',
  'status',
  'created_at',
  'updated_at',
];

const SETTINGS_WRITABLE = [
  'recognition_threshold',
  'enrollment_duplicate_threshold',
  'tracking_timeout_seconds',
  'archive_unknown_after_days',
  'tailgating_window_seconds',
  'default_retention_days',
  'detection_counter_throttle_seconds',
  'abnormal_movement_max_count',
  'abnormal_movement_min_total',
  'policy_revocation_bound_seconds',
];
// Policy distribution state (bump_policy_epoch): readable, never writable.
const SETTINGS_READ_ONLY = ['policy_epoch', 'policy_epoch_at', 'policy_urgent_epoch', 'policy_urgent_at'];

const MEMBER_COLUMNS = [
  'id',
  'organization_id',
  'user_id',
  'role',
  'status',
  'title',
  'department',
  'joined_at',
  'expires_at',
  'deactivated_at',
  'deactivated_by',
  'quiet_hours',
  'vacation_until',
  'vacation_delegate_user_id',
  'created_at',
  'updated_at',
];

/** user_settings: same own-row access for both roles; last_organization_id is backend-only. */
function userSettingsPermissions(role: string): NonNullable<TableSpec['extraPermissions']> {
  return {
    select_permissions: [
      {
        role,
        permission: {
          columns: ['user_id', 'locale', 'timezone', 'last_organization_id', 'created_at', 'updated_at'],
          filter: ownUserRow,
        },
      },
    ],
    insert_permissions: [
      {
        role,
        permission: { columns: ['locale', 'timezone'], check: ownUserRow, set: { user_id: 'x-hasura-user-id' } },
      },
    ],
    update_permissions: [
      { role, permission: { columns: ['locale', 'timezone'], filter: ownUserRow, check: ownUserRow } },
    ],
  };
}

function mergePermissions(
  ...parts: NonNullable<TableSpec['extraPermissions']>[]
): NonNullable<TableSpec['extraPermissions']> {
  return {
    select_permissions: parts.flatMap((p) => p.select_permissions ?? []),
    insert_permissions: parts.flatMap((p) => p.insert_permissions ?? []),
    update_permissions: parts.flatMap((p) => p.update_permissions ?? []),
  };
}

export const tenancyTables: TableSpec[] = [
  { name: 'organization_statuses', isEnum: true, profile: 'none' },
  { name: 'member_roles', isEnum: true, profile: 'none' },
  { name: 'member_statuses', isEnum: true, profile: 'none' },
  { name: 'invitation_statuses', isEnum: true, profile: 'none' },
  {
    name: 'organizations',
    profile: 'none',
    relationshipNames: { 'organization_members_organization_id_fkey#array': 'members' },
    extraPermissions: {
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: ORGANIZATION_COLUMNS, filter: ownOrganization } },
        {
          role: USER,
          permission: {
            columns: ['id', 'name', 'slug', 'logo_file_id'],
            filter: { members: { user_id: { _eq: 'X-Hasura-User-Id' }, status: { _eq: 'active' } } },
          },
        },
      ],
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['name', 'legal_name', 'logo_file_id', 'timezone', 'locale'],
            filter: ownOrganization,
            check: ownOrganization,
          },
        },
      ],
    },
  },
  {
    name: 'organization_settings',
    profile: 'none',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['organization_id', ...SETTINGS_WRITABLE, ...SETTINGS_READ_ONLY, 'created_at', 'updated_at'],
            filter: ownOrganizationRow,
          },
        },
      ],
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: { columns: SETTINGS_WRITABLE, filter: ownOrganizationRow, check: ownOrganizationRow },
        },
      ],
    },
  },
  {
    name: 'organization_members',
    profile: 'tenant_crud',
    // Membership needs the invitee's consent: created only by accept_invitation (or the seed), never inserted directly.
    noInsert: true,
    noDelete: true,
    readOnlyColumns: ['deactivated_at', 'deactivated_by', 'joined_at'],
    insertOnlyColumns: ['user_id'],
    relationshipNames: { identities_linked_by_fkey: 'linked_identities' },
    extraPermissions: {
      select_permissions: [{ role: USER, permission: { columns: MEMBER_COLUMNS, filter: ownUserRow } }],
    },
  },
  {
    name: 'organization_invitations',
    profile: 'tenant_crud',
    // Created only by the invite_member action; org_admin may only revoke a pending invitation.
    noInsert: true,
    noDelete: true,
    secretColumns: ['token_hash'],
    readOnlyColumns: ['token_hash', 'accepted_by', 'accepted_at'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['status'],
            filter: { ...ownOrganizationRow, status: { _eq: 'pending' } },
            check: { ...ownOrganizationRow, status: { _eq: 'revoked' } },
          },
        },
      ],
    },
  },
  {
    name: 'user_settings',
    profile: 'none',
    extraPermissions: mergePermissions(userSettingsPermissions(USER), userSettingsPermissions(ORG_ADMIN)),
  },
];

/** `claim_invitation`: exposed to no role, called with the admin secret by the `accept_invitation` action. */
export const tenancyFunctions: FunctionSpec[] = [
  { name: 'accept_invitation', customName: 'claim_invitation', exposedAs: 'mutation', roles: [] },
];
