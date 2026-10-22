import { f } from '@burojs/field-types';

/**
 * The read-only columns and computed fields of `itap.profiles`: what triggers, the processing
 * restriction function and the erasure job maintain. Never written by the console.
 */
export const profileSystemFields = {
  has_face: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Face linked',
      doc: {
        summary:
          'Whether at least one identity (a tracked face) is linked to the profile, so cameras and face authentication can recognise the person. No means pending face link: enrol a face or link an identity.',
        see: 'concept/profile-and-identity',
      },
    },
  }),
  identities_count: f.number({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Identities',
      doc: {
        summary:
          'How many identities are linked to the profile, kept by the platform as identities are linked, merged and unlinked.',
      },
    },
  }),
  is_blacklisted: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Blacklisted',
      doc: {
        summary:
          'Whether the person, or one of the identities linked to the profile, has an active entry on a blacklist watch list. It is not a type: a blacklisted contractor stays a contractor, and a sighting raises a watch-list event.',
      },
    },
  }),
  processing_restricted: f.boolean({
    system: true,
    in: ['list', 'show'],
    texts: {
      label: 'Processing restricted',
      doc: {
        summary:
          'Whether processing of the person’s data is restricted (GDPR Art. 18): the faces are left out of recognition, face authentication, search and dynamic segments, and identities cannot be linked or unlinked; nothing is deleted.',
      },
    },
  }),
  restricted_at: f.dateTime({
    system: true,
    in: ['show'],
    nullable: true,
    texts: { label: 'Restricted at', doc: { summary: 'When processing was restricted; empty while it is not.' } },
  }),
  restriction_reason: f.text({
    system: true,
    in: ['show'],
    nullable: true,
    texts: {
      label: 'Restriction reason',
      doc: {
        summary:
          'Why processing was restricted, as given when it was set; `dsr:` and a request code when a data subject request set it.',
      },
    },
  }),
  erased_at: f.dateTime({
    system: true,
    in: ['list', 'show'],
    nullable: true,
    texts: {
      label: 'Erased at',
      doc: {
        summary:
          'When the person’s data was erased by a data subject request. An erased profile is a tombstone: its personal data is gone, it can no longer be changed and its restriction is never lifted.',
      },
    },
  }),
};
