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
  // secret: the AES-256-GCM encrypted key secret the backend verifies request signatures with (slice 9 task 3).
  { name: 'client_application_keys', profile: 'tenant_read', secretColumns: ['secret_hash', 'secret'] },
  // Written by the backend service / decision engine; org_admin reads (attempts: the evidentiary record).
  { name: 'authentication_sessions', profile: 'tenant_read', secretColumns: ['nonce_hash', 'claimed_ref_hash'] },
  { name: 'authentication_attempts', profile: 'tenant_read' },
  // Internal: stage-1 retrieval centroids and replay detection.
  { name: 'identity_centroids', profile: 'none' },
  { name: 'auth_sequence_digests', profile: 'none' },
  // Row types of the backend service functions (public projection of a decision; session state); store nothing.
  { name: 'auth_decisions', schema: 'itap_results', profile: 'none' },
  { name: 'auth_session_states', schema: 'itap_results', profile: 'none' },
];

const serviceOnly = (name: string, exposedAs: 'query' | 'mutation', reason: string): FunctionSpec => ({
  name,
  exposedAs,
  roles: [],
  unscopedReturnReason: `admin-only: ${reason}`,
});

export const authFunctions: FunctionSpec[] = [
  { name: 'revoke_client_key', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  { name: 'review_authentication_attempt', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  // Backend only: the rotate_client_key action generates the plaintext and stores its hash with the caller session.
  { name: 'store_client_key', exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [] },
  // Backend face authentication service (/v1/auth/*, action authenticate_face) after key auth; cron sweep.
  serviceOnly('auth_open_session', 'mutation', 'auth service after key auth (explicit organization and application)'),
  serviceOnly('auth_service_decide', 'mutation', 'auth service after key auth (explicit organization and application)'),
  serviceOnly('auth_second_factor', 'mutation', 'auth service after key auth (explicit organization and application)'),
  serviceOnly('auth_session_state', 'query', 'auth service after key auth (explicit organization and application)'),
  serviceOnly('expire_auth_sessions', 'mutation', 'cron expire_auth_sessions per organization'),
  // Seed only (task 4): back-dated sessions / attempts / reviews of the 30-day history through the real functions.
  {
    name: 'seed_auth_flow',
    exposedAs: 'mutation',
    sessionArgument: 'hasura_session',
    roles: [],
    unscopedReturnReason: 'admin-only: seed history (pnpm seed)',
  },
];
