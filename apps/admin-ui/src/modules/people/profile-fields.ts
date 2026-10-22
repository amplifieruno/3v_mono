import { f } from '@burojs/field-types';
import { COMPANY_RESOURCE, USER_RESOURCE, WORK_SCHEDULE_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import {
  ACCESS_LEVELS,
  ACCESS_LEVEL_ENUM,
  PROFILE_STATUSES,
  PROFILE_STATUS_ENUM,
  PROFILE_TYPES,
  PROFILE_TYPE_ENUM,
} from '../../enums/people';
import { customFields } from '../../fields/custom-fields';
import { checkEmail } from '../../fields/email-check';
import { storageFile } from '../../fields/storage-file';
import { profileSystemFields } from './profile-system-fields';

/** Largest avatar the input sends: a portrait photo, not a document scan. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** `storage.files.metadata.kind` of a profile picture (not a sensitive kind: a plain org-bucket image). */
export const AVATAR_FILE_KIND = 'avatar';

/** The columns only employees use (`types` in `./profile.ts` hides them from the other types). */
export const EMPLOYEE_FIELD_NAMES = ['employee_id', 'department', 'job_title', 'work_schedule_id'] as const;

/**
 * Columns of `itap.profiles` the `org_admin` role reads (`number`, `organization_id` and
 * `source_integration_id` left out: the code, the session and phase 12's integrations stand for
 * them). Every type's columns are declared here and each record type hides the others, so the
 * mapping selects them all. The read-only columns are in `./profile-system-fields.ts`.
 */
export const profileFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    generated: 'always',
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Code',
      doc: {
        summary:
          'Reference assigned by the system when the profile is created (`PROFILE-00001`), unique within the organization and never reused.',
      },
    },
  }),
  profile_type: enumField(PROFILE_TYPES, PROFILE_TYPE_ENUM, {
    required: true,
    // The record type: buro never lets the discriminator change on edit.
    write: 'create',
    texts: {
      label: 'Type',
      doc: {
        summary:
          'Employee, visitor, contractor or VIP; chosen when the profile is created and fixed in the console afterwards. The type decides which fields the profile has. Being on a blacklist is not a type: see Blacklisted.',
      },
    },
  }),
  first_name: f.string({ required: true, texts: 'First name' }),
  last_name: f.string({ required: true, texts: 'Last name' }),
  avatar_file_id: storageFile({
    bucket: 'organization',
    kind: AVATAR_FILE_KIND,
    accept: 'image/png,image/jpeg,image/webp',
    maxSize: AVATAR_MAX_BYTES,
    texts: {
      label: 'Photo',
      doc: {
        summary:
          'A portrait shown on the profile: PNG, JPEG or WebP up to 2 MB, stored in the organization’s own files. It is only a picture; recognition uses the face photos of the person’s identities.',
      },
    },
  }),
  status: enumField(PROFILE_STATUSES, PROFILE_STATUS_ENUM, {
    required: true,
    default: 'active',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Whether the person is expected on site. Profiles are never deleted: set one inactive, suspended or terminated to end access and keep its history. Leaving active narrows access on the terminals at once.',
      },
    },
  }),
  email: f.email({ nullable: true, validate: checkEmail, texts: 'Email' }),
  phone: f.string({ nullable: true, texts: 'Phone' }),
  company_id: f.relation({
    to: COMPANY_RESOURCE,
    nullable: true,
    open: 'page',
    texts: {
      label: 'Company',
      doc: {
        summary:
          'The company the person belongs to: the tenant an employee works for, a contractor’s vendor, or the organization a visitor comes from.',
      },
    },
  }),
  employee_id: f.string({
    nullable: true,
    texts: {
      label: 'Employee ID',
      doc: { summary: 'The person’s number in the employer’s HR system, for matching imports and reports.' },
    },
  }),
  department: f.string({ nullable: true, texts: 'Department' }),
  job_title: f.string({ nullable: true, texts: 'Job title' }),
  work_schedule_id: f.relation({
    to: WORK_SCHEDULE_RESOURCE,
    nullable: true,
    open: 'page',
    texts: {
      label: 'Work schedule',
      doc: {
        summary:
          'The weekly hours the person is expected on site. Attendance reports, after-hours events and the "on shift now" segment condition compare activity with it; empty means no fixed hours.',
      },
    },
  }),
  access_level: enumField(ACCESS_LEVELS, ACCESS_LEVEL_ENUM, {
    required: true,
    default: 'basic',
    texts: {
      label: 'Access level',
      doc: {
        summary:
          'The person’s clearance on the 4-step scale access policies compare with areas (basic, standard, elevated, administrative). Lowering it can narrow door access at once.',
      },
    },
  }),
  start_date: f.date({
    nullable: true,
    texts: {
      label: 'Start date',
      doc: { summary: 'First day the person is expected: the hiring date, a contract’s start or the visit day.' },
    },
  }),
  end_date: f.date({
    nullable: true,
    texts: {
      label: 'End date',
      doc: {
        summary:
          'Last day the person is expected, on or after the start date. The daily lifecycle job sets visitors and contractors whose end date has passed to inactive.',
      },
    },
  }),
  external_id: f.string({
    nullable: true,
    texts: {
      label: 'External ID',
      doc: {
        summary:
          'The person’s key in the system the profile was imported from (an HR integration matches its rows by it); empty for profiles created here.',
      },
    },
  }),
  notes: f.text({ nullable: true, texts: 'Notes' }),
  custom_fields: customFields({
    entity: 'profile',
    texts: {
      label: 'Custom attributes',
      doc: {
        summary:
          'Values of the organization’s own profile attributes (Organization → Custom attributes), such as a badge number. Required attributes must be filled whenever these values are saved; values of inactive or deleted attributes are kept.',
      },
    },
  }),
  ...profileSystemFields,
  restricted_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['show'],
    nullable: true,
    open: 'none',
    texts: {
      label: 'Restricted by',
      doc: {
        summary:
          'The member who restricted processing, or who filed the data subject request that did (its reason then reads `dsr:` and the request code).',
      },
    },
  }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
