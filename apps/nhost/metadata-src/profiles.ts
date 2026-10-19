import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };

export const profileTables: TableSpec[] = [
  { name: 'profile_types', isEnum: true, profile: 'none' },
  { name: 'profile_statuses', isEnum: true, profile: 'none' },
  { name: 'access_levels', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_entities', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_types', isEnum: true, profile: 'none' },
  { name: 'custom_attribute_definitions', profile: 'tenant_crud', insertOnlyColumns: ['entity', 'key'] },
  {
    name: 'profiles',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'identities_count', 'source_integration_id'],
    computedFields: [{ name: 'has_face', function: 'profile_has_face' }],
  },
  { name: 'profile_document_kinds', isEnum: true, profile: 'none' },
  { name: 'consent_purposes', isEnum: true, profile: 'none' },
  { name: 'consent_statuses', isEnum: true, profile: 'none' },
  { name: 'consent_methods', isEnum: true, profile: 'none' },
  {
    // Created by the upload_profile_document action (the file is a sensitive kind org_admin cannot upload itself).
    name: 'profile_documents',
    profile: 'tenant_crud',
    noInsert: true,
    readOnlyColumns: ['profile_id', 'file_id'],
  },
  { name: 'consent_records', profile: 'tenant_crud', insertOnlyColumns: ['profile_id'] },
  {
    // Found by the system; org_admin reviews (status is the only writable column), merge_profiles closes pairs.
    name: 'profile_duplicate_candidates',
    profile: 'tenant_crud',
    noInsert: true,
    noDelete: true,
    readOnlyColumns: ['profile_a_id', 'profile_b_id', 'similarity', 'reasons', 'detected_at'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['status'],
            // Merged candidates belong to merge_profiles.
            filter: { _and: [ownOrganizationRow, { status: { _neq: 'merged' } }] },
            check: { _and: [ownOrganizationRow, { status: { _in: ['open', 'dismissed'] } }] },
          },
        },
      ],
    },
  },
];

export const profileFunctions: FunctionSpec[] = [
  { name: 'merge_profiles', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
];
