import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

export const identityTables: TableSpec[] = [
  { name: 'identity_statuses', isEnum: true, profile: 'none' },
  { name: 'identity_sources', isEnum: true, profile: 'none' },
  { name: 'identity_photo_kinds', isEnum: true, profile: 'none' },
  {
    name: 'identities',
    profile: 'tenant_crud',
    readOnlyColumns: [
      'number',
      'confidence',
      'first_seen_at',
      'last_seen_at',
      'detection_count',
      'matching_enabled',
      'linked_at',
      'linked_by',
    ],
  },
  {
    name: 'identity_photos',
    profile: 'tenant_crud',
    // device_id stays read-only until devices (and its FK) arrive in slice 3.
    readOnlyColumns: ['device_id'],
    insertOnlyColumns: ['identity_id', 'file_id'],
  },
  {
    // Written by the backend (enrollment/recognition) and SQL functions only; org_admin may read and delete.
    name: 'identity_embeddings',
    profile: 'tenant_read',
    extraPermissions: { delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownOrganizationRow } }] },
  },
  {
    // Row type of itap.match_face; stores nothing. Root fields hidden: rows are reachable through the function only.
    name: 'face_matches',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['distance', 'identity_id', 'organization_id', 'profile_id', 'similarity'],
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
];

export const identityFunctions: FunctionSpec[] = [
  { name: 'match_face', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
];
