import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const userEditableTemplate: BoolExp = { _and: [ownOrganizationRow, { is_system: { _eq: false } }] };
const FIELD_COLUMNS = ['enum_values', 'field', 'label', 'operators', 'organization_id', 'target', 'value_type'];
const CONTEXT_COLUMNS = [
  'day_end',
  'day_start',
  'evaluated_at',
  'local_date',
  'on_shift_schedule_ids',
  'organization_id',
  'segment_active',
  'timezone',
];

/** Segments (spec §6.5) and behavioral activity stats (spec §6.10). */
export const segmentTables: TableSpec[] = [
  { name: 'segment_kinds', isEnum: true, profile: 'none' },
  { name: 'segment_targets', isEnum: true, profile: 'none' },
  { name: 'segment_statuses', isEnum: true, profile: 'none' },
  { name: 'segment_member_sources', isEnum: true, profile: 'none' },
  {
    // kind and target are fixed at creation (also guarded in SQL); member_count / last_evaluated_at are maintained by
    // the membership trigger and the evaluator.
    name: 'segments',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'member_count', 'last_evaluated_at', 'last_evaluation_error', 'last_evaluation_failed_at'],
    insertOnlyColumns: ['kind', 'target'],
  },
  {
    // Membership history: manual rows via add_segment_members / remove_segment_members, rule rows via the evaluator.
    name: 'segment_members',
    profile: 'tenant_read',
    // For the console's "Add members": in add_segment_members' answer, the rows that call opened.
    computedFields: [{ name: 'opened_now', function: 'segment_member_opened_now' }],
  },
  {
    // is_system templates are seeded: visible, never edited or deleted by org_admin.
    name: 'segment_templates',
    profile: 'tenant_crud',
    readOnlyColumns: ['is_system'],
    insertOnlyColumns: ['target'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['category', 'conditions', 'description', 'name'],
            filter: userEditableTemplate,
            check: userEditableTemplate,
          },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: userEditableTemplate } }],
    },
  },
  { name: 'segment_daily_stats', profile: 'tenant_read' },
  { name: 'identity_activity_stats', profile: 'tenant_read' },
  { name: 'profile_activity_stats', profile: 'tenant_read' },
  {
    // Row type of itap.segment_fields, the condition field catalog (stores nothing; named apart from the function).
    name: 'segment_field_rows',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: FIELD_COLUMNS,
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
  {
    // Row type of itap.segment_evaluation_context (time / timezone inputs of the backend translator; stores nothing).
    name: 'segment_evaluation_contexts',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: CONTEXT_COLUMNS,
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
  // Row type of itap.sync_segment_members (admin secret only; stores nothing).
  { name: 'segment_sync_results', schema: 'itap_results', profile: 'none' },
  // Debounced evaluation requests per organization (written at commit by input triggers; cron evaluate_segments_pending).
  { name: 'segment_evaluation_requests', profile: 'none' },
  // Row type of itap.run_activity_stats (admin secret only; stores nothing).
  { name: 'activity_stats_refreshes', schema: 'itap_results', profile: 'none' },
];

/** Manual membership, the condition field catalog and evaluation (translator context, rule membership sync). */
export const segmentFunctions: FunctionSpec[] = [
  ...['add_segment_members', 'remove_segment_members'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
  { name: 'segment_fields', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  { name: 'segment_evaluation_context', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
  {
    // The evaluator's writer: evaluate_segment action / evaluation crons (backend actor with the organization session).
    name: 'sync_segment_members',
    exposedAs: 'mutation',
    sessionArgument: 'hasura_session',
    roles: [],
  },
  // Evaluation crons (admin secret only): evaluate_segments_pending (due / finish), evaluate_segments (hourly).
  { name: 'due_segment_evaluations', exposedAs: 'query', roles: [] },
  { name: 'finish_segment_evaluation_request', exposedAs: 'mutation', roles: [] },
  { name: 'run_activity_stats', exposedAs: 'mutation', roles: [] },
  { name: 'refresh_segment_daily_stats', exposedAs: 'mutation', roles: [] },
];
