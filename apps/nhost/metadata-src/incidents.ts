import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
const own = (column: string): BoolExp => ({ _and: [ownOrganizationRow, { [column]: { _eq: 'X-Hasura-User-Id' } }] });
// The sender may edit or withdraw a handover until the recipient acknowledges it.
const ownOpenHandover: BoolExp = { _and: [own('from_user_id'), { acknowledged_at: { _is_null: true } }] };

/** Incidents, shift handovers and operator workspaces (spec §6.9). */
export const incidentTables: TableSpec[] = [
  { name: 'incident_statuses', isEnum: true, profile: 'none' },
  { name: 'incident_dispositions', isEnum: true, profile: 'none' },
  { name: 'incident_activity_kinds', isEnum: true, profile: 'none' },
  { name: 'incident_identity_roles', isEnum: true, profile: 'none' },
  {
    // History: not deletable. Lifecycle columns change only through the incident mutation functions.
    name: 'incidents',
    profile: 'tenant_crud',
    noDelete: true,
    readOnlyColumns: [
      'number',
      'status',
      'disposition',
      'escalation_step',
      'last_escalated_at',
      'acknowledged_by',
      'acknowledged_at',
      'resolved_by',
      'resolved_at',
      'resolution',
    ],
  },
  { name: 'incident_events', profile: 'tenant_crud', insertOnlyColumns: ['incident_id', 'event_id'] },
  { name: 'incident_identities', profile: 'tenant_crud', insertOnlyColumns: ['incident_id', 'identity_id'] },
  {
    // author_id is stamped from the session member; only the author edits or deletes a note.
    name: 'incident_notes',
    profile: 'tenant_crud',
    readOnlyColumns: ['author_id'],
    insertOnlyColumns: ['incident_id'],
    extraPermissions: {
      update_permissions: [{ role: ORG_ADMIN, permission: { columns: ['body'], filter: own('author_id') } }],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: own('author_id') } }],
    },
  },
  { name: 'incident_note_files', profile: 'tenant_crud', insertOnlyColumns: ['note_id', 'file_id'] },
  // Timeline written by triggers and functions only.
  { name: 'incident_activities', profile: 'tenant_read' },
  {
    // from_user_id stamped from the session member; acknowledged_at via acknowledge_shift_handover.
    name: 'shift_handovers',
    profile: 'tenant_crud',
    readOnlyColumns: ['from_user_id', 'acknowledged_at'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['to_user_id', 'shift_started_at', 'shift_ended_at', 'summary'],
            filter: ownOpenHandover,
            check: ownOrganizationRow,
          },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownOpenHandover } }],
    },
  },
  { name: 'shift_handover_incidents', profile: 'tenant_crud', insertOnlyColumns: ['handover_id', 'incident_id'] },
  {
    // User-owned: every operation is limited to rows of the session user; user_id is preset from the session.
    name: 'operator_workspaces',
    profile: 'tenant_crud',
    readOnlyColumns: ['user_id'],
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['name', 'layout', 'is_default'],
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', user_id: 'x-hasura-user-id' },
          },
        },
      ],
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['created_at', 'id', 'is_default', 'layout', 'name', 'organization_id', 'updated_at', 'user_id'],
            filter: own('user_id'),
          },
        },
      ],
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: { columns: ['name', 'layout', 'is_default'], filter: own('user_id'), check: own('user_id') },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: own('user_id') } }],
    },
  },
];

export const incidentFunctions: FunctionSpec[] = [
  'acknowledge_incident',
  'start_investigation',
  'resolve_incident',
  'close_incident',
  'escalate_incident',
  'acknowledge_shift_handover',
].map((name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }));
