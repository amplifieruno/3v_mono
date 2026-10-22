import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* People enums; values are the rows of the Hasura enum tables in `PEOPLE_ENUM_TABLES`. */

export const PROFILE_TYPE_ENUM = 'profile_type';

export const PROFILE_TYPES = ['employee', 'visitor', 'contractor', 'vip'] as const;

export const profileTypeEnum = defineEnum({
  name: PROFILE_TYPE_ENUM,
  values: enumValues(PROFILE_TYPES, {
    employee: 'default',
    visitor: 'info',
    contractor: 'secondary',
    vip: 'warning',
  }),
  texts: {
    employee: {
      label: 'Employee',
      doc: {
        summary:
          'Works in the building for a tenant or a service provider, usually on a work schedule; has an employee ID, department and job title.',
      },
    },
    visitor: {
      label: 'Visitor',
      doc: {
        summary:
          'Comes for a visit: access usually covers the visit days only (start and end date) and the host is named on the visit.',
      },
    },
    contractor: {
      label: 'Contractor',
      doc: {
        summary:
          'Works on site for a contractor or vendor company for a limited period; the end date is when the contract access stops.',
      },
    },
    vip: {
      label: 'VIP',
      doc: {
        summary:
          'An executive or guest of honour given special attention: event rules, segments and reports can single VIPs out.',
      },
    },
  },
});

export const PROFILE_STATUS_ENUM = 'profile_status';

export const PROFILE_STATUSES = ['active', 'inactive', 'suspended', 'terminated'] as const;

export const profileStatusEnum = defineEnum({
  name: PROFILE_STATUS_ENUM,
  values: enumValues(PROFILE_STATUSES, {
    active: 'success',
    inactive: 'secondary',
    suspended: 'warning',
    terminated: 'destructive',
  }),
  texts: {
    active: 'Active',
    inactive: {
      label: 'Inactive',
      doc: {
        summary:
          'No longer expected on site: set by hand, by the daily lifecycle job for expired visitors and contractors, or when the profile was merged into another.',
      },
    },
    suspended: {
      label: 'Suspended',
      doc: { summary: 'Temporarily without access, for example during an investigation; set back to active by hand.' },
    },
    terminated: {
      label: 'Terminated',
      doc: { summary: 'The relationship ended (employment or contract); the profile is kept for its history.' },
    },
  },
});

export const ACCESS_LEVEL_ENUM = 'access_level';

export const ACCESS_LEVELS = ['basic', 'standard', 'elevated', 'admin'] as const;

export const accessLevelEnum = defineEnum({
  name: ACCESS_LEVEL_ENUM,
  values: enumValues(ACCESS_LEVELS, {
    basic: 'secondary',
    standard: 'default',
    elevated: 'warning',
    admin: 'destructive',
  }),
  texts: {
    basic: {
      label: 'Basic',
      doc: { summary: 'Clearance 1 of 4: matches areas up to the public level in access rules.' },
    },
    standard: {
      label: 'Standard',
      doc: { summary: 'Clearance 2 of 4: matches areas up to the restricted level.' },
    },
    elevated: {
      label: 'Elevated',
      doc: { summary: 'Clearance 3 of 4: matches areas up to the secure level.' },
    },
    admin: {
      label: 'Administrative',
      doc: { summary: 'Clearance 4 of 4: matches every area, classified ones included.' },
    },
  },
});

/** Each people enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const PEOPLE_ENUM_TABLES: Readonly<Record<string, string>> = {
  [PROFILE_TYPE_ENUM]: 'profile_types',
  [PROFILE_STATUS_ENUM]: 'profile_statuses',
  [ACCESS_LEVEL_ENUM]: 'access_levels',
};
