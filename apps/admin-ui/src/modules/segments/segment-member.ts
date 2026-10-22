import { defineResource } from '@burojs/core';
import { SEGMENT_IDENTITY_MEMBER_RESOURCE, SEGMENT_PROFILE_MEMBER_RESOURCE } from '../../data/resource-names';
import { segmentIdentityMemberFields, segmentProfileMemberFields } from './segment-member-fields';
import { removeFromSegmentFlow } from './segment-membership-flows';

const MEMBERSHIP_SUMMARY =
  'A period during which a person or a face was a member of a segment: added by hand or by the evaluation of the conditions, ended by hand or by the evaluation. Memberships are never deleted: they are the segment’s history.';

/**
 * Memberships of people (`profile_id` set): a profile segment's members and history, and a
 * profile's Segments tab. Read only: added with "Add members" / "Add to segment", ended with
 * "Remove from segment" (manual ones) or by the evaluation (rule ones).
 */
export const segmentProfileMember = defineResource(SEGMENT_PROFILE_MEMBER_RESOURCE, {
  texts: {
    label: 'Segment membership',
    labelPlural: 'Segment memberships',
    doc: { summary: `${MEMBERSHIP_SUMMARY} This one is of a known person (profile).` },
  },
  basePath: '/segment-people',
  displayField: 'profile_id',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  fields: segmentProfileMemberFields,
  actions: (r) => ({ item: [r.action.flow('remove_from_segment', removeFromSegmentFlow('profiles'))] }),
  views: {
    list: { page: false, columns: ['segment_id', 'profile_id', 'source', 'added_at', 'removed_at'], defaultSort: [{ field: 'added_at', direction: 'desc' }] },
    show: { page: false, body: (l) => [l.grid(['segment_id', 'profile_id', 'source']), l.grid(['added_at', 'added_by']), l.grid(['removed_at', 'removed_by'])] },
  },
});

/**
 * Memberships of faces (`identity_id` set): an identity segment's members and history, and an
 * identity's Segments tab. Read only, as for people.
 */
export const segmentIdentityMember = defineResource(SEGMENT_IDENTITY_MEMBER_RESOURCE, {
  texts: {
    label: 'Segment membership of a face',
    labelPlural: 'Segment memberships of faces',
    doc: { summary: `${MEMBERSHIP_SUMMARY} This one is of a tracked face (identity), known or unknown.` },
  },
  basePath: '/segment-identities',
  displayField: 'identity_id',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  fields: segmentIdentityMemberFields,
  actions: (r) => ({ item: [r.action.flow('remove_from_segment', removeFromSegmentFlow('identities'))] }),
  views: {
    list: { page: false, columns: ['segment_id', 'identity_id', 'source', 'added_at', 'removed_at'], defaultSort: [{ field: 'added_at', direction: 'desc' }] },
    show: { page: false, body: (l) => [l.grid(['segment_id', 'identity_id', 'source']), l.grid(['added_at', 'added_by']), l.grid(['removed_at', 'removed_by'])] },
  },
});
