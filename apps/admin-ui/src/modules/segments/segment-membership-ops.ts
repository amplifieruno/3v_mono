import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import {
  SEGMENT_DAILY_STAT_RESOURCE,
  SEGMENT_IDENTITY_MEMBER_RESOURCE,
  SEGMENT_PROFILE_MEMBER_RESOURCE,
  SEGMENT_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';
import { SEGMENTS_BINDING } from './segment-ops';

const NOTHING = ' Nothing was changed.';

/**
 * What `add_segment_members` raises: the segment is gone or archived, a chosen person or face is
 * not in the organization any more, an identity was merged into another, or a person's processing
 * is restricted (`segment_members_restricted`, also an identity linked to such a person). The
 * function adds all or nothing.
 */
export const ADD_SEGMENT_MEMBERS_REFUSALS = {
  segment_not_found: 'The segment no longer exists.' + NOTHING,
  segment_archived: 'The segment is archived: set its status back to Active or Inactive to add members.' + NOTHING,
  segment_member_not_found: 'One of the chosen people or faces no longer exists in this organization: choose again.' + NOTHING,
  identity_merged: 'One of the chosen identities was merged into another: choose the identity it was merged into.' + NOTHING,
  subject_restricted:
    'Processing of one of the chosen people is restricted (or the face belongs to such a person): they cannot join segments until the restriction is lifted.' +
    NOTHING,
} satisfies Record<string, SqlRefusalText>;

/** What `remove_segment_members` raises: only that the segment is gone. */
export const REMOVE_SEGMENT_MEMBERS_REFUSALS = {
  segment_not_found: 'The segment no longer exists.' + NOTHING,
} satisfies Record<string, SqlRefusalText>;

/** A segment and the people or faces (by the segment's target) to add or remove. */
export const segmentMembersInput = z.object({
  segmentId: z.string().uuid(),
  subjectIds: z.array(z.string().uuid()).min(1),
});

export type SegmentMembersInput = z.infer<typeof segmentMembersInput>;

/** How many memberships an add opened (new or pinned members) or a remove closed. */
export const membersChanged = z.object({ count: z.number().int() });

/** What an add did: memberships it opened, and chosen ones who were already members by hand (left as they were). */
export const membersAdded = membersChanged.extend({ kept: z.number().int() });

const variables = (input: unknown) => {
  const { segmentId, subjectIds } = input as SegmentMembersInput;
  return { segment: segmentId, ids: `{${subjectIds.join(',')}}` };
};

const countOf = (field: string) => (data: unknown) => {
  const rows = rootOf(data, field);
  return { count: Array.isArray(rows) ? rows.length : 0 };
};

/**
 * The answer of `add_segment_members` (every open manual membership of the ids) split by `opened_now`:
 * the rows this call opened, and the ones that were open before it.
 */
export function addedOf(data: unknown): z.infer<typeof membersAdded> {
  const rows = rootOf(data, 'add_segment_members');
  const list = Array.isArray(rows) ? (rows as readonly unknown[]) : [];
  const count = list.filter((row) => typeof row === 'object' && row !== null && (row as { opened_now?: unknown }).opened_now === true).length;
  return { count, kept: list.length - count };
}

/** Refreshed by any membership change: the segment (member count), its members and its figures. */
const MEMBERSHIP_EFFECTS = [
  { resource: SEGMENT_RESOURCE },
  { resource: SEGMENT_PROFILE_MEMBER_RESOURCE },
  { resource: SEGMENT_IDENTITY_MEMBER_RESOURCE },
  { resource: SEGMENT_DAILY_STAT_RESOURCE },
];

/**
 * `add_segment_members(hasura_session, p_segment, p_ids)`: opens a manual membership for each
 * person or face without an open one. Someone who is a member by rule is pinned: the rule
 * membership ends and a manual one starts at the same instant (the daily figures count neither).
 * Someone already added by hand stays as they are. Answers the open manual memberships of the ids;
 * `opened_now` (true only inside this call's transaction) tells the ones it opened.
 */
export const addSegmentMembersOperation = hasuraOperation(
  SEGMENTS_BINDING,
  'addSegmentMembers',
  {
    kind: 'mutation',
    document: `mutation AddSegmentMembers($segment: uuid!, $ids: _uuid!) {
  add_segment_members(args: { p_segment: $segment, p_ids: $ids }) { id source opened_now }
}`,
    variables,
    mapResult: addedOf,
  },
  sqlRefusals(ADD_SEGMENT_MEMBERS_REFUSALS),
);

/** Adds people or faces to a segment by hand (manual or dynamic; not archived). */
export const addSegmentMembers = defineMutation('itap:add-segment-members', {
  binding: addSegmentMembersOperation.binding,
  input: schema(segmentMembersInput),
  output: schema(membersAdded),
  effects: MEMBERSHIP_EFFECTS,
});

/**
 * `remove_segment_members(hasura_session, p_segment, p_ids)`: closes the open MANUAL memberships
 * of the ids (removed now, by the caller). Rule memberships are the evaluation's: they end only
 * when the conditions stop holding. Answers the memberships it closed.
 */
export const removeSegmentMembersOperation = hasuraOperation(
  SEGMENTS_BINDING,
  'removeSegmentMembers',
  {
    kind: 'mutation',
    document: `mutation RemoveSegmentMembers($segment: uuid!, $ids: _uuid!) {
  remove_segment_members(args: { p_segment: $segment, p_ids: $ids }) { id removed_at }
}`,
    variables,
    mapResult: countOf('remove_segment_members'),
  },
  sqlRefusals(REMOVE_SEGMENT_MEMBERS_REFUSALS),
);

/** Ends manual memberships of a segment; the history keeps them. */
export const removeSegmentMembers = defineMutation('itap:remove-segment-members', {
  binding: removeSegmentMembersOperation.binding,
  input: schema(segmentMembersInput),
  output: schema(membersChanged),
  effects: MEMBERSHIP_EFFECTS,
});
