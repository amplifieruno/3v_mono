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
