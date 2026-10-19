import type { BoolExp, FunctionSpec, TableSpec } from './types.js';

const ORG_ADMIN = 'org_admin';
const ownOrganizationRow: BoolExp = { organization_id: { _eq: 'X-Hasura-Organization-Id' } };
// User-owned rows (subscriptions, inbox): the session user's rows of the session organization.
const ownSubscription: BoolExp = {
  _and: [ownOrganizationRow, { user_id: { _eq: 'X-Hasura-User-Id' } }],
};
const ownNotification = ownSubscription;
const visibleDelivery: BoolExp = {
  _and: [
    ownOrganizationRow,
    { _or: [{ subscription_id: { _is_null: true } }, { recipient_user_id: { _eq: 'X-Hasura-User-Id' } }] },
  ],
};
const DELIVERY_COLUMNS = [
  'acknowledged_at', 'attempts', 'channel', 'content', 'created_at', 'deliver_after', 'delivered_at', 'digested_into', 'error',
  'escalation_cycle', 'escalation_step_id', 'event_id', 'id', 'incident_id', 'organization_id', 'priority',
  'recipient_address', 'recipient_key', 'recipient_user_id', 'report_id', 'rule_id', 'sent_at', 'status',
  'subscription_id',
];
const INBOX_COLUMNS = [
  'acknowledged_at', 'body', 'created_at', 'delivery_id', 'event_id', 'id', 'incident_id', 'organization_id', 'priority',
  'read_at', 'title', 'updated_at', 'user_id',
];
const REPORT_COLUMNS = [
  'ack_rate', 'acknowledged', 'avg_response_seconds', 'channel', 'dead_letter', 'delivered', 'digested', 'escalations',
  'failed', 'organization_id', 'pending', 'sent', 'total',
];
const userEditableTemplate: BoolExp = { _and: [ownOrganizationRow, { is_system: { _eq: false } }] };

const SUBSCRIPTION_INPUT = [
  'channel', 'event_type', 'facility_id', 'identity_id', 'is_active', 'min_severity', 'profile_id', 'watch_list_id',
];

/** Notification configuration (spec §6.12): templates, recipients, escalation, on-call, rules, subscriptions. */
export const notificationTables: TableSpec[] = [
  { name: 'notification_channels', isEnum: true, profile: 'none' },
  { name: 'notification_priorities', isEnum: true, profile: 'none' },
  { name: 'notification_digest_modes', isEnum: true, profile: 'none' },
  {
    // is_system templates are seeded: visible, never edited or deleted by org_admin.
    name: 'notification_templates',
    profile: 'tenant_crud',
    readOnlyColumns: ['is_system'],
    extraPermissions: {
      update_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: ['body', 'channel', 'locale', 'name', 'subject'],
            filter: userEditableTemplate,
            check: userEditableTemplate,
          },
        },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: userEditableTemplate } }],
    },
  },
  { name: 'recipient_groups', profile: 'tenant_crud' },
  { name: 'recipient_group_members', profile: 'tenant_crud', insertOnlyColumns: ['group_id'] },
  { name: 'on_call_schedules', profile: 'tenant_crud' },
  { name: 'on_call_schedule_members', profile: 'tenant_crud', insertOnlyColumns: ['schedule_id'] },
  { name: 'escalation_policies', profile: 'tenant_crud' },
  { name: 'escalation_policy_steps', profile: 'tenant_crud', insertOnlyColumns: ['policy_id'] },
  {
    // last_triggered_at is written by Stage C.
    name: 'notification_rules',
    profile: 'tenant_crud',
    readOnlyColumns: ['number', 'last_triggered_at'],
  },
  { name: 'notification_rule_event_types', profile: 'tenant_crud', insertOnlyColumns: ['rule_id'] },
  { name: 'notification_rule_channels', profile: 'tenant_crud', insertOnlyColumns: ['rule_id'] },
  {
    // User-owned: every operation is limited to the session user's rows; user_id is preset from the session.
    name: 'notification_subscriptions',
    profile: 'tenant_crud',
    readOnlyColumns: ['user_id'],
    extraPermissions: {
      insert_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: SUBSCRIPTION_INPUT,
            check: ownOrganizationRow,
            set: { organization_id: 'x-hasura-organization-id', user_id: 'x-hasura-user-id' },
          },
        },
      ],
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: [...SUBSCRIPTION_INPUT, 'created_at', 'id', 'organization_id', 'updated_at', 'user_id'].sort(),
            filter: ownSubscription,
          },
        },
      ],
      update_permissions: [
        { role: ORG_ADMIN, permission: { columns: SUBSCRIPTION_INPUT, filter: ownSubscription, check: ownSubscription } },
      ],
      delete_permissions: [{ role: ORG_ADMIN, permission: { filter: ownSubscription } }],
    },
  },
  { name: 'notification_delivery_statuses', isEnum: true, profile: 'none' },
  {
    // Append-only log written by Stage C / escalation / digests; status fields updated by the senders. Not audited.
    // Subscriptions are private (like their audit rows): a subscription delivery is visible to its recipient only.
    name: 'notification_deliveries',
    profile: 'tenant_read',
    // Digest items -> their combined delivery (digest), and the combined delivery's items.
    relationshipNames: {
      notification_deliveries_digested_into_fkey: 'digest',
      'notification_deliveries_digested_into_fkey#array': 'digest_items',
    },
    eventTriggers: [
      {
        // Non in_app channels: stubbed providers (email log, sms/push delivered). The handler claims the row, so
        // in_app, deferred (deliver_after) and digest rows are skipped; failures retry via the retry_deliveries cron.
        name: 'send_delivery',
        operations: ['insert'],
        retry: { num_retries: 5, retry_interval_seconds: 15, timeout_seconds: 30 },
      },
    ],
    extraPermissions: {
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: DELIVERY_COLUMNS, filter: visibleDelivery, allow_aggregations: true } },
      ],
    },
  },
  {
    // In-app inbox: owner-only; the owner may set/clear read_at. Acknowledging goes through acknowledge_notification
    // only (it also acknowledges the incident of an escalation page).
    name: 'user_notifications',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        { role: ORG_ADMIN, permission: { columns: INBOX_COLUMNS, filter: ownNotification, allow_aggregations: true } },
      ],
      update_permissions: [
        { role: ORG_ADMIN, permission: { columns: ['read_at'], filter: ownNotification, check: ownNotification } },
      ],
    },
  },
  {
    // Row type of itap.delivery_report; stores nothing. Root fields hidden: rows are reachable through the function.
    name: 'delivery_report_rows',
    schema: 'itap_results',
    profile: 'tenant_read',
    extraPermissions: {
      select_permissions: [
        {
          role: ORG_ADMIN,
          permission: {
            columns: REPORT_COLUMNS,
            filter: ownOrganizationRow,
            query_root_fields: [],
            subscription_root_fields: [],
          },
        },
      ],
    },
  },
];

/** Owner inbox mutations (rows of the session user only) and the per-channel delivery report. */
export const notificationFunctions: FunctionSpec[] = [
  ...['acknowledge_notification', 'mark_notifications_read'].map(
    (name): FunctionSpec => ({ name, exposedAs: 'mutation', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] }),
  ),
  { name: 'delivery_report', exposedAs: 'query', sessionArgument: 'hasura_session', roles: [ORG_ADMIN] },
];
