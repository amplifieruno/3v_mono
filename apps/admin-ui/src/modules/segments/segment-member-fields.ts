import { f } from '@burojs/field-types';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE, SEGMENT_RESOURCE, USER_RESOURCE } from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { SEGMENT_MEMBER_SOURCES, SEGMENT_MEMBER_SOURCE_ENUM } from '../../enums/segments';
import { dateTime } from '../../fields/date-time';

/*
 * One membership period of one person or face in a segment (`itap.segment_members`): opened by a
 * person (source manual) or by the evaluation of the conditions (source rule), closed when it ends,
 * never reopened and never deleted. The table is select-only for `org_admin`: rows change only
 * through `add_segment_members` / `remove_segment_members` and the evaluation. A row names exactly
 * one profile or one identity (by the segment's target), so it is read through two resources over
 * the one table (G45), each declaring only its own subject.
 */

const id = f.uuid({ system: true, texts: 'ID', in: [] });

const segmentId = f.relation({
  to: SEGMENT_RESOURCE,
  system: true,
  open: 'page',
  providerOptions: { relationship: 'segment' },
  texts: { label: 'Segment', doc: { summary: 'The segment the person or face is (or was) a member of.' } },
});

/** Source, the period and who opened and closed it: every membership carries these. */
const period = {
  source: enumField(SEGMENT_MEMBER_SOURCES, SEGMENT_MEMBER_SOURCE_ENUM, {
    system: true,
    texts: {
      label: 'Source',
      doc: {
        summary:
          'Manual: added by a person, and kept until a person removes it. Rule: added by the evaluation of a dynamic segment’s conditions, and closed by it when they stop holding. Adding someone who is a member by rule turns the membership into a manual one.',
      },
    },
  }),
  added_at: dateTime({
    system: true,
    texts: { label: 'Member since', doc: { summary: 'When the membership began: when it was added by hand or found by an evaluation.' } },
  }),
  added_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Added by', doc: { summary: 'The member who added it by hand; empty for a membership added by the evaluation.' } },
  }),
  removed_at: dateTime({
    system: true,
    texts: {
      label: 'Ended',
      doc: {
        summary:
          'When the membership ended: removed by hand, no longer matching the conditions, outside the segment’s active window or schedule, or turned into a manual one. Empty while it lasts.',
      },
    },
  }),
  removed_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Removed by', doc: { summary: 'The member who removed it by hand; empty when the evaluation ended it.' } },
  }),
};

/** The columns of a membership of a person (`profile_id` set). */
export const segmentProfileMemberFields = {
  id,
  segment_id: segmentId,
  profile_id: f.relation({
    to: PROFILE_RESOURCE,
    system: true,
    open: 'page',
    providerOptions: { relationship: 'profile' },
    texts: { label: 'Person', doc: { summary: 'The known person (profile) who is or was a member.' } },
  }),
  ...period,
};

/** The columns of a membership of a face (`identity_id` set). */
export const segmentIdentityMemberFields = {
  id,
  segment_id: segmentId,
  identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    system: true,
    open: 'page',
    providerOptions: { relationship: 'identity' },
    texts: { label: 'Identity', doc: { summary: 'The tracked face (identity, known or unknown) that is or was a member.' } },
  }),
  ...period,
};

/** The columns of a segment's current members and of its earlier memberships. */
export const CURRENT_PROFILE_MEMBER_COLUMNS = ['profile_id', 'source', 'added_at', 'added_by'] as const;
export const CURRENT_IDENTITY_MEMBER_COLUMNS = ['identity_id', 'source', 'added_at', 'added_by'] as const;
export const PAST_PROFILE_MEMBER_COLUMNS = ['profile_id', 'source', 'added_at', 'removed_at', 'removed_by'] as const;
export const PAST_IDENTITY_MEMBER_COLUMNS = ['identity_id', 'source', 'added_at', 'removed_at', 'removed_by'] as const;
/** The columns of a person's or a face's Segments tab. */
export const SUBJECT_MEMBERSHIP_COLUMNS = ['segment_id', 'source', 'added_at', 'removed_at'] as const;
