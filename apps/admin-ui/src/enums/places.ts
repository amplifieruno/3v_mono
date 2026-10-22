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

/** Each places enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const PLACES_ENUM_TABLES: Readonly<Record<string, string>> = {
  [FACILITY_STATUS_ENUM]: 'facility_statuses',
  [AREA_TYPE_ENUM]: 'area_types',
  [AREA_ACCESS_LEVEL_ENUM]: 'area_access_levels',
  [AREA_STATUS_ENUM]: 'area_statuses',
};
