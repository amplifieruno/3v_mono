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
