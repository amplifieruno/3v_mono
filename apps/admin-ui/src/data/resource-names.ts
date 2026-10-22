/**
 * Registered names of the resources that fields, blocks and other modules read, place or link
 * by name (`useList`, `resourceByName`, relation `to`). One place for every shared name, so
 * the defining files and the fields they use need not import each other: an import cycle
 * between resource modules breaks the dev server (a `const` read before it is initialised).
 * Lint refuses import cycles (`import-x/no-cycle`).
 */
export const CUSTOM_ATTRIBUTE_RESOURCE = 'custom_attribute_definition';
export const FACILITY_RESOURCE = 'facility';
export const AREA_RESOURCE = 'area';
export const FLOOR_PLAN_RESOURCE = 'floor_plan';
export const ACCESS_POINT_RESOURCE = 'access_point';
export const ACCESS_POINT_DEVICE_RESOURCE = 'access_point_device';
export const FACILITY_TEMPLATE_RESOURCE = 'facility_template';
export const DEVICE_RESOURCE = 'device';
export const DEVICE_AREA_RESOURCE = 'device_area';
export const DEVICE_HEALTH_METRIC_RESOURCE = 'device_health_metric';
export const DEVICE_EVENT_RESOURCE = 'device_event';
export const COMPANY_RESOURCE = 'company';
export const WORK_SCHEDULE_RESOURCE = 'work_schedule';
export const USER_RESOURCE = 'user';
export const PROFILE_RESOURCE = 'profile';
export const PROFILE_DOCUMENT_RESOURCE = 'profile_document';
export const CONSENT_RECORD_RESOURCE = 'consent_record';
export const PROFILE_DUPLICATE_RESOURCE = 'profile_duplicate_candidate';
export const IDENTITY_RESOURCE = 'identity';
export const IDENTITY_MERGE_RESOURCE = 'identity_merge';
export const IDENTITY_MERGE_SOURCE_RESOURCE = 'identity_merge_source';
export const IDENTITY_DUPLICATE_RESOURCE = 'identity_duplicate_candidate';
export const VERIFICATION_REQUEST_RESOURCE = 'verification_request';
export const IDENTITY_RELATIONSHIP_RESOURCE = 'identity_relationship';
export const VISIT_RESOURCE = 'visit';
export const DETECTION_RESOURCE = 'detection';
export const TRACKING_SESSION_RESOURCE = 'tracking_session';
export const IDENTITY_LOCATION_RESOURCE = 'identity_location';
export const AREA_OCCUPANCY_RESOURCE = 'area_occupancy';
export const EVENT_RESOURCE = 'event';
export const EVENT_RULE_RESOURCE = 'event_rule';
export const EVENT_RULE_VERSION_RESOURCE = 'event_rule_version';
export const EVENT_RULE_SCOPE_RESOURCE = 'event_rule_version_scope';
export const EVENT_RULE_SCOPE_HISTORY_RESOURCE = 'event_rule_version_scope_history';
export const INCIDENT_RESOURCE = 'incident';
export const INCIDENT_ACTIVITY_RESOURCE = 'incident_activity';
export const INCIDENT_NOTE_RESOURCE = 'incident_note';
export const INCIDENT_NOTE_HISTORY_RESOURCE = 'incident_note_history';
export const INCIDENT_NOTE_FILE_RESOURCE = 'incident_note_file';
export const INCIDENT_NOTE_FILE_HISTORY_RESOURCE = 'incident_note_file_history';
export const INCIDENT_EVENT_RESOURCE = 'incident_event';
export const INCIDENT_EVENT_HISTORY_RESOURCE = 'incident_event_history';
export const INCIDENT_IDENTITY_RESOURCE = 'incident_identity';
export const INCIDENT_IDENTITY_HISTORY_RESOURCE = 'incident_identity_history';
export const WATCH_LIST_RESOURCE = 'watch_list';
export const WATCH_LIST_ENTRY_RESOURCE = 'watch_list_entry';
export const WATCH_LIST_IDENTITY_ENTRY_RESOURCE = 'watch_list_identity_entry';
export const WATCH_LIST_PROFILE_ENTRY_RESOURCE = 'watch_list_profile_entry';
export const SHIFT_HANDOVER_RESOURCE = 'shift_handover';
export const SHIFT_HANDOVER_INCIDENT_RESOURCE = 'shift_handover_incident';
export const SHIFT_HANDOVER_INCIDENT_HISTORY_RESOURCE = 'shift_handover_incident_history';
export const OPERATOR_WORKSPACE_RESOURCE = 'operator_workspace';
export const NOTIFICATION_RULE_RESOURCE = 'notification_rule';
export const NOTIFICATION_RULE_EVENT_TYPE_RESOURCE = 'notification_rule_event_type';
export const NOTIFICATION_RULE_CHANNEL_RESOURCE = 'notification_rule_channel';
export const NOTIFICATION_TEMPLATE_RESOURCE = 'notification_template';
export const RECIPIENT_GROUP_RESOURCE = 'recipient_group';
export const ESCALATION_POLICY_RESOURCE = 'escalation_policy';
export const RECIPIENT_GROUP_USER_MEMBER_RESOURCE = 'recipient_group_user_member';
export const RECIPIENT_GROUP_ADDRESS_MEMBER_RESOURCE = 'recipient_group_address_member';
export const ESCALATION_GROUP_STEP_RESOURCE = 'escalation_group_step';
export const ESCALATION_ON_CALL_STEP_RESOURCE = 'escalation_on_call_step';
export const ESCALATION_STEP_RESOURCE = 'escalation_step';
export const ON_CALL_SCHEDULE_RESOURCE = 'on_call_schedule';
export const ON_CALL_SCHEDULE_MEMBER_RESOURCE = 'on_call_schedule_member';
export const NOTIFICATION_SUBSCRIPTION_RESOURCE = 'notification_subscription';
export const NOTIFICATION_DELIVERY_RESOURCE = 'notification_delivery';
export const USER_NOTIFICATION_RESOURCE = 'user_notification';
export const WEBHOOK_SUBSCRIPTION_RESOURCE = 'webhook_subscription';
export const WEBHOOK_SUBSCRIPTION_EVENT_TYPE_RESOURCE = 'webhook_subscription_event_type';
export const WEBHOOK_DELIVERY_RESOURCE = 'webhook_delivery';
