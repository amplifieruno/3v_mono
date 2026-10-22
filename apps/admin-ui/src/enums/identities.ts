import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Identity enums; values are the rows of the Hasura enum tables in `IDENTITY_ENUM_TABLES`. */

export const IDENTITY_STATUS_ENUM = 'identity_status';

export const IDENTITY_STATUSES = [
  'unverified',
  'pending_verification',
  'verified',
  'suspended',
  'archived',
  'merged',
] as const;

/**
 * The statuses an administrator may set by editing an identity. `pending_verification` and
 * `verified` belong to the verification workflow and `merged` to merges; the database refuses
 * them from an edit (`identities_verification_status`, `identities_reserved_values`).
 */
export const IDENTITY_SETTABLE_STATUSES = ['unverified', 'suspended', 'archived'] as const;

export const identityStatusEnum = defineEnum({
  name: IDENTITY_STATUS_ENUM,
  values: enumValues(IDENTITY_STATUSES, {
    unverified: 'secondary',
    pending_verification: 'info',
    verified: 'success',
    suspended: 'warning',
    archived: 'secondary',
    merged: 'destructive',
  }),
  texts: {
    unverified: {
      label: 'Unverified',
      doc: { summary: 'Nobody has confirmed who this is yet; the usual status of a new identity.' },
    },
    pending_verification: {
      label: 'Pending verification',
      doc: { summary: 'A verification request is open; set by the request, not by hand.' },
    },
    verified: {
      label: 'Verified',
      doc: { summary: 'An approved verification request confirmed the identity; set by the approval, not by hand.' },
    },
    suspended: {
      label: 'Suspended',
      doc: { summary: 'Set aside by an administrator, for example while a mix-up is investigated; still matched.' },
    },
    archived: {
      label: 'Archived',
      doc: {
        summary:
          'No longer of interest: left out of matching and no new photos can be added. The daily lifecycle job archives unknown identities not seen for a long time.',
      },
    },
    merged: {
      label: 'Merged',
      doc: {
        summary:
          'Merged into another identity: kept with its history but left out of matching, and frozen until the merge is rolled back.',
      },
    },
  },
});

export const IDENTITY_SOURCE_ENUM = 'identity_source';

export const IDENTITY_SOURCES = ['camera', 'enrollment', 'manual', 'import', 'merge', 'split'] as const;

export const identitySourceEnum = defineEnum({
  name: IDENTITY_SOURCE_ENUM,
  values: enumValues(IDENTITY_SOURCES, {
    camera: 'info',
    enrollment: 'default',
    manual: 'secondary',
    import: 'secondary',
    merge: 'warning',
    split: 'warning',
  }),
  texts: {
    camera: { label: 'Camera', doc: { summary: 'Created by recognition when a camera saw a face it did not know.' } },
    enrollment: { label: 'Enrollment', doc: { summary: 'Created by enrolling a face for a profile.' } },
    manual: { label: 'Manual', doc: { summary: 'Created from uploaded or captured photos in the console.' } },
    import: { label: 'Import', doc: { summary: 'Imported from another system, such as an access control export.' } },
    merge: { label: 'Merge', doc: { summary: 'Created by a merge of identities.' } },
    split: { label: 'Split', doc: { summary: 'Split off another identity whose photos belonged to two people.' } },
  },
});

export const IDENTITY_PHOTO_KIND_ENUM = 'identity_photo_kind';

export const IDENTITY_PHOTO_KINDS = ['capture', 'enrollment', 'manual'] as const;

export const identityPhotoKindEnum = defineEnum({
  name: IDENTITY_PHOTO_KIND_ENUM,
  values: enumValues(IDENTITY_PHOTO_KINDS, { capture: 'info', enrollment: 'default', manual: 'secondary' }),
  texts: {
    capture: { label: 'Camera capture', doc: { summary: 'A face a camera captured during recognition.' } },
    enrollment: { label: 'Enrollment', doc: { summary: 'A photo given when a face was enrolled for a profile.' } },
    manual: { label: 'Uploaded', doc: { summary: 'A photo uploaded or captured in the console.' } },
  },
});

/** Each identity enum by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const IDENTITY_ENUM_TABLES: Readonly<Record<string, string>> = {
  [IDENTITY_STATUS_ENUM]: 'identity_statuses',
  [IDENTITY_SOURCE_ENUM]: 'identity_sources',
  [IDENTITY_PHOTO_KIND_ENUM]: 'identity_photo_kinds',
};
