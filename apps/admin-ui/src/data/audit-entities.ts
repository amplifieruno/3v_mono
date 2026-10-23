import * as R from './resource-names';

/**
 * The tables the audit log names in `audit_log.entity` (each audited by `itap.audit_row_change` or
 * written by a platform function), with the words the console shows for them and, for a table
 * whose rows have a console page of their own, the resource that opens one. Link rows of another
 * record (an incident's notes, a rule's channels, a hold's targets…) and tables without a page
 * (photos, files, the organization row and its settings) stay plain text. A table not listed here
 * shows its raw name. `tests/modules/audit-log.test.ts` checks every resource against the table it
 * is mapped to.
 */
export const AUDIT_ENTITIES = {
  access_grants: ['Access grant', R.ACCESS_GRANT_RESOURCE],
  access_point_devices: ['Access point device', null],
  access_points: ['Access point', R.ACCESS_POINT_RESOURCE],
  access_policies: ['Access policy', R.ACCESS_POLICY_RESOURCE],
  access_policy_version_subjects: ['Access policy subject', null],
  access_policy_version_targets: ['Access policy target', null],
  access_policy_versions: ['Access policy version', R.ACCESS_POLICY_VERSION_RESOURCE],
  areas: ['Area', R.AREA_RESOURCE],
  authentication_attempts: ['Authentication attempt', R.AUTHENTICATION_ATTEMPT_RESOURCE],
  bulk_jobs: ['Bulk job', R.BULK_JOB_RESOURCE],
  client_application_access_points: ['Client application access point', null],
  client_application_attributes: ['Client application attribute', null],
  client_application_facilities: ['Client application facility', null],
  client_application_keys: ['Client application key', R.CLIENT_APPLICATION_KEY_RESOURCE],
  client_application_modes: ['Client application mode', null],
  client_application_segments: ['Client application segment', null],
  client_applications: ['Client application', R.CLIENT_APPLICATION_RESOURCE],
  companies: ['Company', R.COMPANY_RESOURCE],
  consent_records: ['Consent record', R.CONSENT_RECORD_RESOURCE],
  custom_attribute_definitions: ['Custom attribute', R.CUSTOM_ATTRIBUTE_RESOURCE],
  dashboards: ['Dashboard', R.DASHBOARD_RESOURCE],
  data_subject_requests: ['Data subject request', R.DSR_RESOURCE],
  device_areas: ['Device area', null],
  devices: ['Device', R.DEVICE_RESOURCE],
  emergency_override_areas: ['Emergency override area', null],
  emergency_overrides: ['Emergency override', R.EMERGENCY_OVERRIDE_RESOURCE],
  escalation_policies: ['Escalation policy', R.ESCALATION_POLICY_RESOURCE],
  escalation_policy_steps: ['Escalation step', null],
  event_rule_version_scopes: ['Event rule scope', null],
  event_rule_versions: ['Event rule version', R.EVENT_RULE_VERSION_RESOURCE],
  event_rules: ['Event rule', R.EVENT_RULE_RESOURCE],
  export_definitions: ['Export definition', R.EXPORT_DEFINITION_RESOURCE],
  export_jobs: ['Export job', R.EXPORT_JOB_RESOURCE],
  facilities: ['Facility', R.FACILITY_RESOURCE],
  facility_templates: ['Facility template', R.FACILITY_TEMPLATE_RESOURCE],
  files: ['File', null],
  floor_plans: ['Floor plan', R.FLOOR_PLAN_RESOURCE],
  identities: ['Identity', R.IDENTITY_RESOURCE],
  identity_duplicate_candidates: ['Identity duplicate candidate', R.IDENTITY_DUPLICATE_RESOURCE],
  identity_merges: ['Identity merge', R.IDENTITY_MERGE_RESOURCE],
  identity_photos: ['Identity photo', null],
  identity_relationships: ['Identity relationship', R.IDENTITY_RELATIONSHIP_RESOURCE],
  incident_events: ['Incident event', null],
  incident_identities: ['Incident identity', null],
  incident_note_files: ['Incident note file', null],
  incident_notes: ['Incident note', null],
  incidents: ['Incident', R.INCIDENT_RESOURCE],
  integrations: ['Integration', R.INTEGRATION_RESOURCE],
  legal_hold_targets: ['Legal hold target', null],
  legal_holds: ['Legal hold', R.LEGAL_HOLD_RESOURCE],
  notification_rule_channels: ['Notification rule channel', null],
  notification_rule_event_types: ['Notification rule event type', null],
  notification_rules: ['Notification rule', R.NOTIFICATION_RULE_RESOURCE],
  notification_subscriptions: ['Notification subscription', R.NOTIFICATION_SUBSCRIPTION_RESOURCE],
  notification_templates: ['Notification template', R.NOTIFICATION_TEMPLATE_RESOURCE],
  on_call_schedule_members: ['On-call schedule member', null],
  on_call_schedules: ['On-call schedule', R.ON_CALL_SCHEDULE_RESOURCE],
  operator_workspaces: ['Operator workspace', R.OPERATOR_WORKSPACE_RESOURCE],
  // Registered by the organization module (`members.ts`, `invitations.ts`).
  organization_invitations: ['Invitation', 'organization_invitation'],
  organization_members: ['Member', 'organization_member'],
  organization_settings: ['Organization settings', null],
  organizations: ['Organization', null],
  processing_activities: ['Processing activity', R.PROCESSING_ACTIVITY_RESOURCE],
  processing_activity_data_classes: ['Processing activity data class', null],
  profile_documents: ['Profile document', R.PROFILE_DOCUMENT_RESOURCE],
  profile_duplicate_candidates: ['Profile duplicate candidate', R.PROFILE_DUPLICATE_RESOURCE],
  profiles: ['Profile', R.PROFILE_RESOURCE],
  recipient_group_members: ['Recipient group member', null],
  recipient_groups: ['Recipient group', R.RECIPIENT_GROUP_RESOURCE],
  report_facilities: ['Report facility', null],
  report_schedules: ['Report schedule', R.REPORT_SCHEDULE_RESOURCE],
  report_segments: ['Report segment', null],
  report_templates: ['Report template', R.REPORT_TEMPLATE_RESOURCE],
  reports: ['Report', R.REPORT_RESOURCE],
  retention_policies: ['Retention policy', R.RETENTION_POLICY_RESOURCE],
  saved_searches: ['Saved search', R.SAVED_SEARCH_RESOURCE],
  search_requests: ['Search', R.SEARCH_REQUEST_RESOURCE],
  segment_templates: ['Segment template', R.SEGMENT_TEMPLATE_RESOURCE],
  segments: ['Segment', R.SEGMENT_RESOURCE],
  shift_handover_incidents: ['Shift handover incident', null],
  shift_handovers: ['Shift handover', R.SHIFT_HANDOVER_RESOURCE],
  verification_requests: ['Verification request', R.VERIFICATION_REQUEST_RESOURCE],
  visits: ['Visit', R.VISIT_RESOURCE],
  watch_list_entries: ['Watch list entry', R.WATCH_LIST_ENTRY_RESOURCE],
  watch_lists: ['Watch list', R.WATCH_LIST_RESOURCE],
  webhook_subscription_event_types: ['Webhook event type', null],
  webhook_subscriptions: ['Webhook subscription', R.WEBHOOK_SUBSCRIPTION_RESOURCE],
  work_schedules: ['Work schedule', R.WORK_SCHEDULE_RESOURCE],
} as const satisfies Readonly<Record<string, readonly [string, string | null]>>;

export type AuditEntity = keyof typeof AUDIT_ENTITIES;

/** Every table name the audit log knows, in alphabetical order (the entity enum's values). */
export const AUDIT_ENTITY_TABLES = Object.keys(AUDIT_ENTITIES) as [AuditEntity, ...AuditEntity[]];

const isKnown = (table: string): table is AuditEntity => Object.hasOwn(AUDIT_ENTITIES, table);

/** The resource whose page shows a row of `table`, or `null` (unknown table, or rows without a page). */
export function auditEntityResource(table: unknown): string | null {
  return typeof table === 'string' && isKnown(table) ? AUDIT_ENTITIES[table][1] : null;
}

/** The words for `table`: its label when known, the raw name otherwise (never empty). */
export function auditEntityLabel(table: unknown): string {
  if (typeof table !== 'string' || table === '') return '—';
  return isKnown(table) ? AUDIT_ENTITIES[table][0] : table;
}
