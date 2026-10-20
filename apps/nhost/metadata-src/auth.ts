import type { FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';

/** Face authentication service (spec §6.16, SA_6, slice 9): client applications, keys, sessions, attempts. */
export const authTables: TableSpec[] = [
  { name: 'client_application_platforms', isEnum: true, profile: 'none' },
  { name: 'client_application_statuses', isEnum: true, profile: 'none' },
  { name: 'auth_modes', isEnum: true, profile: 'none' },
  { name: 'auth_attributes', isEnum: true, profile: 'none' },
  { name: 'auth_steps', isEnum: true, profile: 'none' },
  { name: 'auth_outcomes', isEnum: true, profile: 'none' },
  { name: 'auth_review_statuses', isEnum: true, profile: 'none' },
  { name: 'auth_failure_reasons', isEnum: true, profile: 'none' },
  { name: 'auth_attack_outcomes', isEnum: true, profile: 'none' },
  { name: 'auth_session_statuses', isEnum: true, profile: 'none' },
  // org_admin CRUD; is_sandbox fixed at insert (also a trigger); revoked is terminal (trigger).
  { name: 'client_applications', profile: 'tenant_crud', readOnlyColumns: ['number'], insertOnlyColumns: ['is_sandbox'] },
  // Bindings (junctions): insert / delete; sandbox apps cannot bind facilities or access points (trigger).
  { name: 'client_application_modes', profile: 'tenant_crud', insertOnlyColumns: ['application_id', 'mode'] },
  { name: 'client_application_attributes', profile: 'tenant_crud', insertOnlyColumns: ['application_id', 'attribute'] },
  { name: 'client_application_segments', profile: 'tenant_crud', insertOnlyColumns: ['application_id', 'segment_id'] },
  { name: 'client_application_facilities', profile: 'tenant_crud', insertOnlyColumns: ['application_id', 'facility_id'] },
  {
    name: 'client_application_access_points',
    profile: 'tenant_crud',
    insertOnlyColumns: ['application_id', 'access_point_id'],
  },
  // Key metadata only: created by store_client_key (backend action rotate_client_key), revoked by revoke_client_key.
  { name: 'client_application_keys', profile: 'tenant_read', secretColumns: ['secret_hash'] },
  // Written by the backend service / decision engine; org_admin reads (attempts: the evidentiary record).
  { name: 'authentication_sessions', profile: 'tenant_read', secretColumns: ['nonce_hash'] },
  { name: 'authentication_attempts', profile: 'tenant_read' },
  // Internal: stage-1 retrieval centroids and replay detection.
  { name: 'identity_centroids', profile: 'none' },
  { name: 'auth_sequence_digests', profile: 'none' },
];

export const authFunctions: FunctionSpec[] = [
  { name: 'revoke_client_key', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  { name: 'review_authentication_attempt', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  // Backend only: the rotate_client_key action generates the plaintext and stores its hash with the caller session.
  { name: 'store_client_key', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [] },
];
