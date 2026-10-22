import { type Check, type CheckDI, defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { photoGalleryBlock } from '../../blocks/photo-gallery/photo-gallery-block';
import { IDENTITY_RESOURCE } from '../../data/resource-names';
import { IDENTITY_SETTABLE_STATUSES } from '../../enums/identities';
import { addPhotosFlow, createIdentityFlow } from './enrollment-flows';
import { identityFields } from './identity-fields';
import { IDENTITY_RULES } from './identity-rules';
import { identitySavedViews } from './identity-views';
import { profile } from './profile';

const SETTABLE: readonly unknown[] = IDENTITY_SETTABLE_STATUSES;

/** Whether the profile `id` (if any) has its processing restricted. */
async function profileRestricted(data: CheckDI['data'], id: unknown): Promise<boolean> {
  if (typeof id !== 'string' || id === '') return false;
  const { data: row } = await data.one(profile, { id });
  return (row as { readonly processing_restricted?: unknown } | null)?.processing_restricted === true;
}

/** What the database refuses on an identity edit, said before anything is sent. */
export const IDENTITY_CHECKS: Check[] = [
  {
    id: 'identityStatusReserved',
    on: ['edit'],
    severity: 'error',
    anchor: 'status',
    texts:
      'Set unverified, suspended or archived here. Verified and pending verification come from verification requests, merged from a merge.',
    when: ({ values, changed }) => changed('status') && !SETTABLE.includes(values.status),
  },
  {
    id: 'identityPrimaryNeedsProfile',
    on: ['edit'],
    severity: 'error',
    anchor: 'is_primary_for_profile',
    texts: 'Only an identity linked to a profile can be its primary identity. Choose the profile first.',
    when: ({ values }) => values.is_primary_for_profile === true && (values.profile_id ?? null) === null,
  },
  {
    // `identities_restricted_link`: neither the old nor the new profile may be restricted.
    id: 'identityLinkRestricted',
    on: ['edit'],
    severity: 'error',
    anchor: 'profile_id',
    texts:
      'Processing of this person’s data is restricted: the identity cannot be linked to or unlinked from the profile until the restriction is lifted.',
    when: async ({ values, was, changed, data }) =>
      changed('profile_id') &&
      ((await profileRestricted(data, was('profile_id'))) || (await profileRestricted(data, values.profile_id))),
  },
];

/**
 * Identities: every tracked face, known (linked to a profile) or unknown. Created by
 * recognition, by enrollment and by "Create identity from photos", never by a plain form, and
 * never deleted (status instead). The page shows the photos the platform holds for the face;
 * "Add photos" gives it more. Merges, verification and the timeline come with the governance
 * screens.
 */
export const identity = defineResource(IDENTITY_RESOURCE, {
  texts: {
    label: 'Identity',
    labelPlural: 'Identities',
    doc: {
      summary:
        'A face the platform tracks: the photos and face templates cameras match against, and when and how often it was seen. Linked to a profile it is a known person; without one, an unknown person.',
      see: 'concept/profile-and-identity',
    },
  },
  basePath: '/identities',
  section: NAV_SECTIONS.people,
  order: 20,
  icon: NAV_ICONS.identities,
  displayField: 'code',
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  fields: identityFields,
  checks: IDENTITY_CHECKS,
  rules: IDENTITY_RULES,
  actions: (r) => ({
    resource: [r.action.flow('create_from_photos', createIdentityFlow)],
    item: [r.action.flow('add_photos', addPhotosFlow)],
  }),
  views: {
    list: {
      columns: ['primary_photo_file_id', 'code', 'status', 'profile_id', 'source', 'last_seen_at', 'detection_count'],
      optionalColumns: ['matching_enabled', 'is_synthetic', 'age', 'first_seen_at', 'link_strength', 'is_primary_for_profile'],
      defaultSort: [{ field: 'last_seen_at', direction: 'desc' }],
      search: { fields: ['code'] },
      filters: {
        fields: ['status', 'source', 'profile_id', 'matching_enabled', 'is_synthetic', 'last_seen_at', 'first_seen_at'],
      },
      savedViews: identitySavedViews(),
    },
    show: {
      header: (l) => [l.grid(['status', 'source', 'is_synthetic'])],
      body: (l) => [
        // A merged identity says so in its status, and Edit and Add photos give the reason.
        l.panel(['matching_enabled'], {
          key: 'matching-notice',
          tone: 'warning',
          texts: {
            title: 'Matching off',
            description:
              'The person withdrew biometric consent: cameras, search and face authentication no longer match this face, no photos can be added, and the face templates are deleted after the consent retention period.',
          },
          when: l.equals(l.ref('record', 'matching_enabled'), false),
        }),
        l.tabs(
          [
            l.panel(
              [
                'primary_photo_file_id',
                l.grid(['code', 'profile_id', 'link_strength']),
                l.grid(['is_primary_for_profile', 'linked_at', 'linked_by']),
                l.grid(['first_seen_at', 'last_seen_at', 'detection_count']),
                l.grid(['age', 'confidence']),
                'attributes',
                'custom_fields',
                l.grid(['created_at', 'updated_at']),
              ],
              { key: 'details', texts: 'Details' },
            ),
            l.panel(
              [
                l.place(photoGalleryBlock, {
                  key: 'identity-photos',
                  props: {
                    identityId: l.ref('record', 'id'),
                    primaryFileId: l.ref('record', 'primary_photo_file_id'),
                  },
                }),
              ],
              { key: 'photos', texts: 'Photos' },
            ),
          ],
          { key: 'sections' },
        ),
      ],
    },
    edit: {
      body: (l) => [
        // Shown for context while editing; neither is written.
        'primary_photo_file_id',
        l.grid(['status', 'source']),
        l.panel([l.grid(['profile_id', 'link_strength', 'is_primary_for_profile'])], {
          key: 'profile-link',
          texts: 'Profile link',
        }),
        'attributes',
        'custom_fields',
      ],
    },
  },
});
