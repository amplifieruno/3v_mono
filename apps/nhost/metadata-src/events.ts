import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
// Only open versions can be deleted; published/superseded versions are history (events reference them).
const openVersion: BoolExp = { _and: [ownOrganizationRow, { status: { _in: ['draft', 'pending_approval'] } }] };

/** Watch lists, events and versioned event rules (spec §6.9, §6.0 versioned entities). */
export const eventTables: TableSpec[] = [
  { name: 'event_severities', isEnum: true, profile: 'none' },
  { name: 'event_types', isEnum: true, profile: 'none' },
  { name: 'watch_list_kinds', isEnum: true, profile: 'none' },
  { name: 'version_statuses', isEnum: true, profile: 'none' },
  { name: 'event_rule_types', isEnum: true, profile: 'none' },
  { name: 'watch_lists', profile: 'tenant_crud' },
  {
    // added_by is stamped from the session member (trigger).
    name: 'watch_list_entries',
    profile: 'tenant_crud',
    readOnlyColumns: ['added_by'],
    insertOnlyColumns: ['watch_list_id', 'identity_id', 'profile_id'],
  },
  // Append-only, system-written (Stage B, device health, crons, actions); not audited.
  { name: 'events', profile: 'tenant_read' },
  {
    // Versioned header: current_version_id only via publish_event_rule_version; counters written by Stage B.
    name: 'event_rules',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'current_version_id', 'last_triggered_at', 'trigger_count'],
    insertOnlyColumns: ['rule_type'],
    relationshipNames: { event_rules_current_version_fkey: 'current_version' },
  },
  {
    // Status published/superseded is reserved for publish_event_rule_version (trigger guard_version_status);
    // published/superseded versions are frozen.
    name: 'event_rule_versions',
    profile: 'tenant_crud',
    readOnlyColumns: ['version', 'published_by', 'published_at'],
    insertOnlyColumns: ['rule_id'],
    relationshipNames: { event_rules_current_version_fkey: 'current_of_rules' },
    // The header's rule type, for the console's per-type parameters editor.
    computedFields: [{ name: 'rule_type', function: 'event_rule_version_rule_type' }],
    extraPermissions: { delete_permissions: [{ role: ORG_ADMIN, permission: { filter: openVersion } }] },
  },
  // Children of a version: editable only while the version is open (trigger guard_version_children).
  { name: 'event_rule_version_scopes', profile: 'tenant_crud', insertOnlyColumns: ['version_id'] },
];

export const eventFunctions: FunctionSpec[] = ['create_event_rule_draft', 'publish_event_rule_version'].map(
  (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
);
