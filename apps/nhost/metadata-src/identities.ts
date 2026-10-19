import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
// Decided requests are history: editable and deletable only while pending.
const pendingRequest: BoolExp = { _and: [ownOrganizationRow, { status: { _eq: 'pending' } }] };

export const identityTables: TableSpec[] = [
  { name: 'identity_statuses', isEnum: true, profile: 'none' },
  { name: 'identity_sources', isEnum: true, profile: 'none' },
  { name: 'identity_photo_kinds', isEnum: true, profile: 'none' },
  { name: 'identity_relations', isEnum: true, profile: 'none' },
  { name: 'candidate_statuses', isEnum: true, profile: 'none' },
  { name: 'verification_statuses', isEnum: true, profile: 'none' },
  { name: 'merge_statuses', isEnum: true, profile: 'none' },
  {
    // Lifecycle by status (spec §6.0): archived, not deleted (erasure: DSR flow, slice 10). Statuses verified /
    // pending_verification are reserved for the verification workflow (trigger identities_verification_status).
    name: 'identities',
    profile: 'tenant_crud',
    noDelete: true,
    insertOnlyColumns: ['is_synthetic'],
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
    relationshipNames: {
      identity_merges_target_identity_fkey: 'merges_as_target',
      identity_merge_sources_source_identity_fkey: 'merges_as_source',
    },
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
    // Raw biometric vectors are never exposed to org_admin; matching happens in SQL (match_face).
    secretColumns: ['embedding'],
    extraPermissions: { delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownOrganizationRow } }] },
  },
  { name: 'identity_relationships', profile: 'tenant_crud', insertOnlyColumns: ['identity_a_id', 'identity_b_id'] },
  {
    // Found by the system; org_admin reviews (status is the only writable column), merge_identities closes pairs.
    name: 'identity_duplicate_candidates',
    profile: 'tenant_crud',
    noInsert: true,
    noDelete: true,
    readOnlyColumns: ['identity_a_id', 'identity_b_id', 'similarity', 'detected_at', 'merge_id'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['status'],
            // Merged candidates belong to the merge functions (rollback reopens them).
            filter: { _and: [ownOrganizationRow, { status: { _neq: 'merged' } }] },
            check: { _and: [ownOrganizationRow, { status: { _in: ['open', 'dismissed'] } }] },
          },
        },
      ],
    },
  },
  {
    // Decided only through approve_verification / reject_verification; requested_by stamped by trigger.
    name: 'verification_requests',
    profile: 'tenant_crud',
    readOnlyColumns: ['status', 'requested_by', 'decided_by', 'decided_at'],
    insertOnlyColumns: ['identity_id'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['assigned_to', 'evidence', 'reason'],
            filter: pendingRequest,
            check: ownOrganizationRow,
          },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: pendingRequest } }],
    },
  },
  // Written only by merge_identities / rollback_merge.
  { name: 'identity_merges', profile: 'tenant_read' },
  { name: 'identity_merge_sources', profile: 'tenant_read' },
  // Undo log, read and written only by the merge functions (spec §6.0).
  { name: 'identity_merge_moves', profile: 'none' },
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
  ...['merge_identities', 'rollback_merge', 'split_identity', 'approve_verification', 'reject_verification'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
];
