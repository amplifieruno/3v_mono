import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Places enums; values are the rows of the Hasura enum tables in `PLACES_ENUM_TABLES`. */

export const FACILITY_STATUS_ENUM = 'facility_status';

export const FACILITY_STATUSES = ['active', 'inactive', 'maintenance'] as const;

export const facilityStatusEnum = defineEnum({
  name: FACILITY_STATUS_ENUM,
  values: enumValues(FACILITY_STATUSES, {
    active: 'success',
    inactive: 'secondary',
    maintenance: 'warning',
  }),
  texts: {
    active: 'Active',
    maintenance: {
      label: 'Under maintenance',
      doc: { summary: 'Temporarily out of normal operation; its devices may be offline.' },
    },
    inactive: { label: 'Inactive', doc: { summary: 'Not in use; kept for its history.' } },
  },
});

export const AREA_TYPE_ENUM = 'area_type';

export const AREA_TYPES = [
  'building',
  'floor',
  'zone',
  'room',
  'sector',
  'entrance',
  'corridor',
  'parking',
  'virtual_zone',
] as const;

export const areaTypeEnum = defineEnum({
  name: AREA_TYPE_ENUM,
  values: enumValues(AREA_TYPES, {
    building: 'default',
    floor: 'info',
    zone: 'secondary',
    room: 'outline',
    sector: 'outline',
    entrance: 'success',
    corridor: 'outline',
    parking: 'secondary',
    virtual_zone: 'warning',
  }),
  texts: {
    building: 'Building',
    floor: { label: 'Floor', doc: { summary: 'A level of a building; its floor plan is drawn on it.' } },
    zone: 'Zone',
    room: 'Room',
    sector: 'Sector',
    entrance: 'Entrance',
    corridor: 'Corridor',
    parking: 'Parking',
    virtual_zone: {
      label: 'Virtual zone',
      doc: {
        summary:
          'A geofence not tied to walls (a radius or polygon on the floor plan); detections inside it are evaluated like any area.',
      },
    },
  },
});

export const AREA_ACCESS_LEVEL_ENUM = 'area_access_level';

/** Ordered from open to most protected; ranked against profile clearances by `itap.access_rank`. */
export const AREA_ACCESS_LEVELS = ['public', 'restricted', 'secure', 'classified'] as const;

export const areaAccessLevelEnum = defineEnum({
  name: AREA_ACCESS_LEVEL_ENUM,
  values: enumValues(AREA_ACCESS_LEVELS, {
    public: 'success',
    restricted: 'info',
    secure: 'warning',
    classified: 'destructive',
  }),
  texts: {
    public: { label: 'Public', doc: { summary: 'Open to everyone; no clearance needed.' } },
    restricted: {
      label: 'Restricted',
      doc: { summary: 'Expects a person with at least standard clearance on their profile.' },
    },
    secure: { label: 'Secure', doc: { summary: 'Expects elevated clearance or higher.' } },
    classified: { label: 'Classified', doc: { summary: 'Expects admin clearance, the highest.' } },
  },
});

export const AREA_STATUS_ENUM = 'area_status';

export const AREA_STATUSES = ['active', 'inactive', 'maintenance'] as const;

export const areaStatusEnum = defineEnum({
  name: AREA_STATUS_ENUM,
  values: enumValues(AREA_STATUSES, {
    active: 'success',
    inactive: 'secondary',
    maintenance: 'warning',
  }),
  texts: {
    active: 'Active',
    maintenance: {
      label: 'Under maintenance',
      doc: { summary: 'Temporarily out of normal use, such as a floor under renovation.' },
    },
    inactive: { label: 'Inactive', doc: { summary: 'Not in use; kept for its history.' } },
  },
});

export const ACCESS_POINT_KIND_ENUM = 'access_point_kind';

export const ACCESS_POINT_KINDS = ['door', 'turnstile', 'gate', 'elevator', 'reception'] as const;

export const accessPointKindEnum = defineEnum({
  name: ACCESS_POINT_KIND_ENUM,
  values: enumValues(ACCESS_POINT_KINDS, {
    door: 'default',
    turnstile: 'info',
    gate: 'secondary',
    elevator: 'outline',
    reception: 'success',
  }),
  texts: {
    door: 'Door',
    turnstile: 'Turnstile',
    gate: 'Gate',
    elevator: 'Elevator',
    reception: {
      label: 'Reception desk',
      doc: { summary: 'A staffed desk where visitors check in, not a physical barrier.' },
    },
  },
});

export const ACCESS_POINT_DIRECTION_ENUM = 'access_point_direction';

export const ACCESS_POINT_DIRECTIONS = ['in', 'out', 'both'] as const;

export const accessPointDirectionEnum = defineEnum({
  name: ACCESS_POINT_DIRECTION_ENUM,
  values: enumValues(ACCESS_POINT_DIRECTIONS, { in: 'info', out: 'secondary', both: 'outline' }),
  texts: {
    in: { label: 'Entry only', doc: { summary: 'People pass only into the area it leads to.' } },
    out: { label: 'Exit only', doc: { summary: 'People pass only out of the area it leads to.' } },
    both: 'Entry and exit',
  },
});

export const ACCESS_POINT_DEVICE_ROLE_ENUM = 'access_point_device_role';

export const ACCESS_POINT_DEVICE_ROLES = ['camera', 'terminal', 'sensor'] as const;

export const accessPointDeviceRoleEnum = defineEnum({
  name: ACCESS_POINT_DEVICE_ROLE_ENUM,
  values: enumValues(ACCESS_POINT_DEVICE_ROLES, {
    camera: 'info',
    terminal: 'default',
    sensor: 'outline',
  }),
  texts: {
    camera: {
      label: 'Camera',
      doc: { summary: 'Watches the access point; its detections are placed at it.' },
    },
    terminal: {
      label: 'Access terminal',
      doc: { summary: 'Decides and opens the passage (badge, PIN or face); receives access policies.' },
    },
    sensor: { label: 'Sensor', doc: { summary: 'Reports the passage state, such as a door contact.' } },
  },
});

/** Each places enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const PLACES_ENUM_TABLES: Readonly<Record<string, string>> = {
  [FACILITY_STATUS_ENUM]: 'facility_statuses',
  [AREA_TYPE_ENUM]: 'area_types',
  [AREA_ACCESS_LEVEL_ENUM]: 'area_access_levels',
  [AREA_STATUS_ENUM]: 'area_statuses',
  [ACCESS_POINT_KIND_ENUM]: 'access_point_kinds',
  [ACCESS_POINT_DIRECTION_ENUM]: 'access_point_directions',
  [ACCESS_POINT_DEVICE_ROLE_ENUM]: 'access_point_device_roles',
};
