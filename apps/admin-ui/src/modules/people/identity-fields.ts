import { f } from '@burojs/field-types';
import { PROFILE_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { IDENTITY_SOURCES, IDENTITY_SOURCE_ENUM, IDENTITY_STATUSES, IDENTITY_STATUS_ENUM } from '../../enums/identities';
import { rangeValidator } from '../../fields/bounded-number';
import { customFields } from '../../fields/custom-fields';
import { storageFile } from '../../fields/storage-file';
import { identitySystemFields } from './identity-system-fields';

/** `storage.files.metadata.kind` of the face crops the platform stores for identities. */
export const IDENTITY_PHOTO_FILE_KIND = 'identity_photo';

/**
 * Columns of `itap.identities` the `org_admin` role reads (`number` and `organization_id` left
 * out: the code and the session stand for them). Identities are created by recognition, by the
 * enrollment actions and by imports, never by a plain form, so only the profile link, the
 * status, the attributes and the custom attributes are edited here. The counters and the
 * matching flag are in `./identity-system-fields.ts`.
 */
export const identityFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  code: f.string({
    generated: 'always',
    write: 'never',
    in: ['list', 'show'],
    texts: {
      label: 'Code',
      doc: {
        summary:
          'Reference assigned by the system when the identity is created (`IDENTITY-00001`), unique within the organization and never reused.',
      },
    },
  }),
  primary_photo_file_id: storageFile({
    bucket: 'organization',
    kind: IDENTITY_PHOTO_FILE_KIND,
    accept: 'image/jpeg',
    displayOnly: true,
    texts: {
      label: 'Photo',
      doc: {
        summary:
          'The best face crop of the identity, chosen by the platform from its photos by quality. The Photos tab shows them all.',
      },
    },
  }),
  status: enumField(IDENTITY_STATUSES, IDENTITY_STATUS_ENUM, {
    required: true,
    default: 'unverified',
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Where the identity stands. An administrator sets unverified, suspended or archived; pending verification and verified come from verification requests, merged from a merge. Archived and merged identities are left out of matching.',
      },
    },
  }),
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    nullable: true,
    open: 'page',
    texts: {
      label: 'Profile',
      doc: {
        summary:
          'The known person this face belongs to. Empty means an unknown person. Linking or unlinking is refused while the person’s processing is restricted, and a synthetic identity is never linked.',
        see: 'concept/profile-and-identity',
      },
    },
  }),
  link_strength: f.number({
    nullable: true,
    min: 0,
    max: 1,
    // The record form does not enforce `min`/`max` (G14): restated as a validator.
    validate: rangeValidator({ min: 0, max: 1 }),
    texts: {
      label: 'Link strength',
      doc: {
        summary:
          'How sure the link to the profile is, from 0 to 1: 1 when an operator or an enrollment confirmed it, lower when it was inferred. Empty without a profile.',
      },
    },
  }),
  is_primary_for_profile: f.boolean({
    default: false,
    texts: {
      label: 'Primary for profile',
      doc: {
        summary:
          'The profile’s main identity: enrolling more photos for the person adds them here. A profile has at most one; it is cleared when the identity moves to another profile.',
      },
    },
  }),
  linked_at: f.dateTime({
    system: true,
    in: ['show'],
    nullable: true,
    texts: { label: 'Linked at', doc: { summary: 'When the identity was linked to its current profile.' } },
  }),
  linked_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    in: ['show'],
    nullable: true,
    open: 'none',
    texts: {
      label: 'Linked by',
      doc: { summary: 'The member who linked the identity to its profile; empty when the platform did (enrollment, import).' },
    },
  }),
  source: enumField(IDENTITY_SOURCES, IDENTITY_SOURCE_ENUM, {
    required: true,
    write: 'never',
    texts: {
      label: 'Source',
      doc: { summary: 'How the identity came to be: a camera, an enrollment, photos in the console, an import, a merge or a split.' },
    },
  }),
  attributes: f.json({
    default: {},
    texts: {
      label: 'Attributes',
      doc: {
        summary:
          'Descriptive data about the person as a JSON object, such as the age and gender estimated from the best photo (`{"age": 34, "gender": "F"}`). Dynamic segments can filter on age and gender.',
      },
    },
  }),
  custom_fields: customFields({
    entity: 'identity',
    texts: {
      label: 'Custom attributes',
      doc: {
        summary:
          'Values of the organization’s own identity attributes (Organization → Custom attributes). Required attributes must be filled whenever these values are saved.',
      },
    },
  }),
  ...identitySystemFields,
  created_at: f.dateTime({ system: true, texts: 'Created', in: ['show'] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: ['show'] }),
};
