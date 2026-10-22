/**
 * Registered names of the places resources that other places resources place or link by
 * name (`resourceByName`, relation `to`), so the defining files need not import each other
 * in a cycle (the facility page lists access points, an access point names its facility).
 */
export const ACCESS_POINT_RESOURCE = 'access_point';
export const ACCESS_POINT_DEVICE_RESOURCE = 'access_point_device';
export const FACILITY_TEMPLATE_RESOURCE = 'facility_template';
