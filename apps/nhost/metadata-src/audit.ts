import type { BoolExp, TableSpec } from './types.js';

const ORG = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
/** Entities whose rows belong to one user: their audit rows are visible to the acting user only. */
const USER_OWNED_ENTITIES = [
  'notification_subscriptions', 'operator_workspaces', 'saved_searches', 'search_requests', 'user_notifications',
];
const visibleAuditRows: BoolExp = {
  _and: [
    ORG,
    { _or: [{ entity: { _nin: USER_OWNED_ENTITIES } }, { user_id: { _eq: 'X-Hasura-User-Id' } }] },
  ],
};

export const auditTables: TableSpec[] = [
  { name: 'audit_actions', isEnum: true, profile: 'none' },
  // Written only by triggers / backend; org admins read their organization's rows, except the audit rows of
  // user-owned entities (subscriptions, workspaces, inbox, search history, saved searches), which only the acting user sees.
  {
    name: 'audit_log',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: 'org_admin',
          permission: {
            columns: [
              'action', 'changes', 'entity', 'entity_id', 'id', 'ip', 'occurred_at', 'organization_id', 'reason', 'user_agent', 'user_id',
            ],
            filter: visibleAuditRows,
            allow_aggregations: true,
          },
        },
      ],
    },
  },
];
