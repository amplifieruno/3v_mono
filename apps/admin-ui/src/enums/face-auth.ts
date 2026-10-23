import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Face authentication enums; values are the rows of the Hasura enum tables in `FACE_AUTH_ENUM_TABLES`. */

export const CLIENT_APPLICATION_PLATFORM_ENUM = 'client_application_platform';
export const CLIENT_APPLICATION_STATUS_ENUM = 'client_application_status';
export const AUTH_MODE_ENUM = 'auth_mode';
export const AUTH_ATTRIBUTE_ENUM = 'auth_attribute';

export const CLIENT_APPLICATION_PLATFORMS = ['web', 'android', 'ios', 'server', 'kiosk'] as const;
export const CLIENT_APPLICATION_STATUSES = ['active', 'suspended', 'revoked'] as const;
export const AUTH_MODES = ['identification', 'verification'] as const;
export const AUTH_ATTRIBUTES = [
  'display_name',
  'photo',
  'profile_type',
  'company',
  'department',
  'employee_id',
  'access_level',
  'segments',
] as const;

export const clientApplicationPlatformEnum = defineEnum({
  name: CLIENT_APPLICATION_PLATFORM_ENUM,
  values: enumValues(CLIENT_APPLICATION_PLATFORMS, {
    web: 'info',
    android: 'success',
    ios: 'secondary',
    server: 'outline',
    kiosk: 'warning',
  }),
  texts: {
    web: { label: 'Web', doc: { summary: 'A web application whose server signs the requests.' } },
    android: { label: 'Android', doc: { summary: 'An Android app; its back end holds the key and signs the requests.' } },
    ios: { label: 'iOS', doc: { summary: 'An iPhone or iPad app; its back end holds the key and signs the requests.' } },
    server: { label: 'Server', doc: { summary: 'A server-to-server integration.' } },
    kiosk: { label: 'Kiosk', doc: { summary: 'A self-service kiosk or terminal, usually at a door or a reception desk.' } },
  },
});

export const clientApplicationStatusEnum = defineEnum({
  name: CLIENT_APPLICATION_STATUS_ENUM,
  values: enumValues(CLIENT_APPLICATION_STATUSES, { active: 'success', suspended: 'warning', revoked: 'destructive' }),
  texts: {
    active: { label: 'Active', doc: { summary: 'Its signed requests are accepted.' } },
    suspended: {
      label: 'Suspended',
      doc: { summary: 'Every request is refused (application inactive) until it is reactivated; keys and bindings are kept.' },
    },
    revoked: {
      label: 'Revoked',
      doc: { summary: 'Retired for good: every request is refused and it can never be reactivated. Its history stays.' },
    },
  },
});

export const authModeEnum = defineEnum({
  name: AUTH_MODE_ENUM,
  values: enumValues(AUTH_MODES, { identification: 'info', verification: 'secondary' }),
  texts: {
    identification: {
      label: 'Identification',
      doc: { summary: 'Who is this? No one is claimed: the face is searched in the application’s whole population.' },
    },
    verification: {
      label: 'Verification',
      doc: { summary: 'Is this the claimed person? The face is compared with that one identity only.' },
    },
  },
});

export const authAttributeEnum = defineEnum({
  name: AUTH_ATTRIBUTE_ENUM,
  values: enumValues(AUTH_ATTRIBUTES, {
    display_name: 'info',
    photo: 'info',
    profile_type: 'secondary',
    company: 'secondary',
    department: 'secondary',
    employee_id: 'warning',
    access_level: 'warning',
    segments: 'outline',
  }),
  texts: {
    display_name: { label: 'Display name', doc: { summary: 'The name of the person’s profile.' } },
    photo: { label: 'Photo', doc: { summary: 'A short-lived link to the primary photo of the recognised face.' } },
    profile_type: { label: 'Profile type', doc: { summary: 'Employee, visitor, contractor and so on.' } },
    company: { label: 'Company', doc: { summary: 'The name of the person’s company.' } },
    department: { label: 'Department', doc: { summary: 'The person’s department, from the profile.' } },
    employee_id: { label: 'Employee ID', doc: { summary: 'The person’s employee number, from the profile.' } },
    access_level: { label: 'Access level', doc: { summary: 'The access level of the person’s profile.' } },
    segments: {
      label: 'Segments',
      doc: { summary: 'The names of the application’s bound segments the person belongs to (never other segments).' },
    },
  },
});

export const FACE_AUTH_ENUM_TABLES: Readonly<Record<string, string>> = {
  [CLIENT_APPLICATION_PLATFORM_ENUM]: 'client_application_platforms',
  [CLIENT_APPLICATION_STATUS_ENUM]: 'client_application_statuses',
  [AUTH_MODE_ENUM]: 'auth_modes',
  [AUTH_ATTRIBUTE_ENUM]: 'auth_attributes',
};
