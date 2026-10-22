import { type Check, type CheckDI, defineResource, relatedList } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { photoGalleryBlock } from '../../blocks/photo-gallery/photo-gallery-block';
import { SUBJECT_ENTRY_COLUMNS } from '../monitoring/watch-list-entry-fields';
import { resourceByName } from '../../data/resource-by-name';
import {
  DETECTION_RESOURCE,
  EVENT_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RESOURCE,
  INCIDENT_IDENTITY_HISTORY_RESOURCE,
  TRACKING_SESSION_RESOURCE,
  VERIFICATION_REQUEST_RESOURCE,
  WATCH_LIST_IDENTITY_ENTRY_RESOURCE,
} from '../../data/resource-names';
import { IDENTITY_SETTABLE_STATUSES } from '../../enums/identities';
import { identityTimelineBlock } from '../../blocks/identity-timeline/identity-timeline-block';
import { addPhotosFlow, createIdentityFlow } from './enrollment-flows';
import { addRelationshipFlow, mergeIntoFlow, splitFlow } from './identity-governance-flows';
import { identityRelationshipsBlock } from './identity-relationships-block';
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
 * never deleted (status instead). The page shows the photos the platform holds for the face,
 * where and when it was seen (timeline), its relationships, verification requests and merges;
 * "Add photos" gives it more, "Merge into this identity" and "Split" fix mixed-up faces.
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
  // A consent record write flips `matching_enabled` of the person's identities (SQL trigger):
  // withdrawing biometric consent refreshes the identity views too.
  data: { provider: 'hasura', dependencies: ['table:consent_records'] },
  operations: { create: false, delete: false },
  builtinActions: { delete: false },
  fields: identityFields,
  checks: IDENTITY_CHECKS,
  rules: IDENTITY_RULES,
  actions: (r) => ({
    resource: [r.action.flow('create_from_photos', createIdentityFlow)],
    item: [
      r.action.flow('add_photos', addPhotosFlow),
      r.action.flow('merge_into', mergeIntoFlow),
      r.action.flow('split', splitFlow),
      r.action.flow('add_relationship', addRelationshipFlow),
    ],
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
            l.panel(
              [l.place(identityTimelineBlock, { key: 'identity-timeline', props: { identityId: l.ref('record', 'id') } })],
              { key: 'timeline', texts: 'Timeline' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(DETECTION_RESOURCE)), {
                  key: 'identity-detections',
                  props: {
                    where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['thumbnail_file_id', 'detected_at', 'device_id', 'area_id', 'facility_id', 'confidence'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'detections', texts: 'Detections' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(TRACKING_SESSION_RESOURCE)), {
                  key: 'identity-sessions',
                  props: {
                    where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['started_at', 'facility_id', 'status', 'last_area_id', 'last_detected_at', 'duration_seconds'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'sessions', texts: 'Sessions' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(EVENT_RESOURCE)), {
                  key: 'identity-events',
                  props: {
                    where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['occurred_at', 'severity', 'event_type', 'title', 'facility_id', 'area_id'],
                    open: 'page',
                  },
                }),
              ],
              { key: 'events', texts: 'Events' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(INCIDENT_IDENTITY_HISTORY_RESOURCE)), {
                  key: 'identity-incidents',
                  props: {
                    where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['incident_id', 'role', 'created_at'],
                    open: 'none',
                  },
                }),
              ],
              { key: 'incidents', texts: 'Incidents' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(WATCH_LIST_IDENTITY_ENTRY_RESOURCE)), {
                  key: 'identity-watch-lists',
                  // Also seeds "+ Create": the new entry is for this identity; the form asks for the list.
                  props: { where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }], columns: [...SUBJECT_ENTRY_COLUMNS], open: 'none' },
                }),
              ],
              { key: 'watch-lists', texts: 'Watch lists' },
            ),
            l.panel(
              [
                l.place(identityRelationshipsBlock, {
                  key: 'identity-relationships',
                  props: { identityId: l.ref('record', 'id') },
                }),
              ],
              { key: 'relationships', texts: 'Relationships' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(VERIFICATION_REQUEST_RESOURCE)), {
                  key: 'identity-verification',
                  props: {
                    // Also seeds "+ Create": a new request is for this identity.
                    where: [{ field: 'identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['status', 'assigned_to', 'requested_by', 'created_at', 'decided_at', 'reason'],
                  },
                }),
              ],
              { key: 'verification', texts: 'Verification' },
            ),
            l.panel(
              [
                l.place(relatedList(resourceByName(IDENTITY_MERGE_RESOURCE)), {
                  key: 'identity-merges-in',
                  texts: { title: 'Identities merged into this one' },
                  props: {
                    where: [{ field: 'target_identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['created_at', 'status', 'reason', 'merged_by', 'rolled_back_at'],
                    open: 'page',
                  },
                }),
                l.place(relatedList(resourceByName(IDENTITY_MERGE_SOURCE_RESOURCE)), {
                  key: 'identity-merged-away',
                  texts: { title: 'This identity merged into another' },
                  props: {
                    where: [{ field: 'source_identity_id', op: 'eq', value: l.ref('record', 'id') }],
                    columns: ['merge_id', 'previous_status', 'previous_profile_id', 'created_at'],
                    open: 'none',
                  },
                }),
              ],
              { key: 'merges', texts: 'Merges' },
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
