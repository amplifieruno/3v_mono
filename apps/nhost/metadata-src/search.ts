import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const SESSION_USER = 'X-Hasura-User-Id';
// Search history is personal, like the inbox: the session user's rows of the session organization.
const ownRequest: BoolExp = { _and: [ownOrganizationRow, { user_id: { _eq: SESSION_USER } }] };
const ownRequestResult: BoolExp = { _and: [ownOrganizationRow, { search_request: { user_id: { _eq: SESSION_USER } } }] };
const ownSavedSearch: BoolExp = { _and: [ownOrganizationRow, { owner_id: { _eq: SESSION_USER } }] };
const visibleSavedSearch: BoolExp = {
  _and: [ownOrganizationRow, { _or: [{ owner_id: { _eq: SESSION_USER } }, { is_shared: { _eq: true } }] }],
};

const REQUEST_COLUMNS = [
  'bulk_job_id', 'bulk_job_row_no', 'completed_at', 'created_at', 'duration_ms', 'error', 'face_count', 'filters', 'fuzzy', 'id', 'image_file_id',
  'max_results', 'organization_id', 'results_count', 'saved_search_id', 'search_type', 'started_at', 'status',
  'threshold', 'top_confidence', 'updated_at', 'user_id',
];
const RESULT_COLUMNS = [
  'confidence', 'created_at', 'id', 'identity_id', 'match_type', 'organization_id', 'profile_id', 'rank',
  'search_request_id',
];
const SAVED_INPUT = [
  'alert_on_match', 'description', 'filters', 'fuzzy', 'image_file_id', 'is_shared', 'max_results', 'name',
  'schedule_cron', 'search_type', 'threshold',
];
// last_error is owner-only: exposed through the computed field owner_last_error.
const SAVED_COLUMNS = [
  ...SAVED_INPUT, 'created_at', 'id', 'last_run_at', 'last_run_status', 'last_search_request_id',
  'next_run_at', 'organization_id', 'owner_id', 'updated_at',
].sort();

/**
 * Search (spec §6.11, §8.3, §8.5): requests and results are written by the backend (action search_faces, cron
 * run_saved_searches) and visible to the member who ran them only; saved searches are owner-managed, and shared ones
 * are readable (never editable) by the organization.
 */
export const searchTables: TableSpec[] = [
  { name: 'search_types', isEnum: true, profile: 'none' },
  { name: 'search_statuses', isEnum: true, profile: 'none' },
  { name: 'search_match_types', isEnum: true, profile: 'none' },
  {
    name: 'search_requests',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: REQUEST_COLUMNS, filter: ownRequest, allow_aggregations: true } },
      ],
    },
  },
  {
    name: 'search_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: RESULT_COLUMNS, filter: ownRequestResult, allow_aggregations: true } },
      ],
    },
  },
  {
    // owner_id is stamped from the session; run state is written by the run_saved_searches cron.
    name: 'saved_searches',
    profile: 'tenant_crud',
    readOnlyColumns: ['owner_id', 'last_run_at', 'next_run_at', 'last_run_status', 'last_error', 'last_search_request_id'],
    computedFields: [
      { name: 'owner_last_error', function: 'saved_search_owner_last_error', sessionArgument: 'hasura_session' },
    ],
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: SAVED_INPUT,
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', owner_id: 'x-hasura-user-id' },
          },
        },
      ],
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: SAVED_COLUMNS, filter: visibleSavedSearch, allow_aggregations: true } },
      ],
      update_permissions: [
        { role: ORG_ADMIN, permission: { columns: SAVED_INPUT, filter: ownSavedSearch, check: ownSavedSearch } },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownSavedSearch } }],
    },
  },
  // Row type of itap.search_identities (admin secret only; stores nothing).
  { name: 'search_matches', schema: 'itap_results', profile: 'none' },
];

export const searchFunctions: FunctionSpec[] = [
  { name: 'search_identities', exposedAs: 'query', roles: [] },
  ...['init_saved_search', 'record_saved_search_run', 'finish_saved_search_run', 'close_stale_search_requests'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', roles: [] }),
  ),
];
