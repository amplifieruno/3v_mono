import { type FlowConfig, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { SEGMENT_RESOURCE } from '../../data/resource-names';
import { type SegmentTarget, MEMBER_RESOURCE_OF, addApplied, rememberSent, removeApplied } from './segment-membership-checks';
import { addSegmentMembers, removeSegmentMembers } from './segment-membership-ops';

/** The flow names of "Add to segment" on a profile and on an identity. */
export const ADD_TO_SEGMENT_FLOW = 'add_to_segment';

const WHO = { profiles: 'the person', identities: 'the face' } as const;

/** The form of "Add to segment": a segment of the record's kind that is not archived. */
function addToSegmentFields(target: SegmentTarget) {
  return {
    segment_id: f.relation({
      to: SEGMENT_RESOURCE,
      required: true,
      candidates: [
        { field: 'target', op: 'eq', value: target },
        // `segment_archived`: an archived segment takes no members.
        { field: 'status', op: 'ne', value: 'archived' },
      ],
      texts: {
        label: 'Segment',
        doc: {
          summary: `The segment to add ${WHO[target]} to by hand: a manual one, or a dynamic one (${WHO[target]} then stays a member whatever its conditions say). Archived segments are not offered.`,
        },
      },
    }),
  };
}

/**
 * "Add to segment" on a profile (target profiles) or an identity (target identities):
 * `add_segment_members` with this record. A current rule member of the chosen segment is pinned
 * (source Manual from now on). Not offered on a merged identity, nor on a person whose processing
 * is restricted (the database refuses both).
 */
export function addToSegmentFlow(target: SegmentTarget) {
  const fields = addToSegmentFields(target);
  const blocked =
    target === 'profiles'
      ? cond.equals(ref('record', 'processing_restricted'), true)
      : cond.equals(ref('record', 'status'), 'merged');
  return {
    texts: {
      label: 'Add to segment',
      // kept 1: already a member by hand, nothing was changed.
      notify: 'Added to the segment by hand: {{count}}. Already a member by hand (left as it was): {{kept}}.',
      doc: {
        summary: `Adds ${WHO[target]} to a manual or dynamic segment by hand; the membership lasts until it is removed by hand.`,
      },
    },
    icon: NAV_ICONS.addToSegment,
    surfaces: { default: 'menu', show: 'menu' },
    when: cond.not(blocked),
    form: { fields, initial: { segment_id: { kind: 'literal', value: null } } },
    submit: {
      mutation: addSegmentMembers,
      // Idempotent: adding a manual member again changes nothing.
      retry: 'after-auth-refresh',
      input: ({ values, record }) => {
        const subjectId = String(record?.id ?? '');
        const segmentId = String(values.segment_id ?? '');
        rememberSent(ADD_TO_SEGMENT_FLOW, subjectId, { segmentId, subjectIds: [subjectId], target });
        return { segmentId, subjectIds: [subjectId] };
      },
      onUnknown: { check: addApplied(ADD_TO_SEGMENT_FLOW) },
    },
    then: { notify: { params: { count: ref('result', 'count'), kept: ref('result', 'kept') } } },
  } satisfies FlowConfig<unknown, Record<never, never>, typeof fields>;
}

/**
 * "Remove from segment" on a current manual membership (a row of a segment's members or of a
 * person's or face's Segments tab): `remove_segment_members` ends it now; the row stays in the
 * history. Rule memberships are not offered: they end when the conditions stop holding. Removing
 * a pinned member of a dynamic segment whose conditions still match brings them back by rule at
 * the next evaluation.
 */
export function removeFromSegmentFlow(target: SegmentTarget) {
  const subject = MEMBER_RESOURCE_OF[target].subject;
  return {
    texts: {
      label: 'Remove from segment',
      confirm: `Remove ${WHO[target]} from the segment? The membership ends now and stays in the history.`,
      // 0 when someone else ended it (or it was pinned again) in the meantime: nothing was changed.
      notify: 'Memberships ended: {{count}}. 0 means it had already ended and nothing was changed.',
      doc: {
        summary:
          'Ends a membership added by hand; it stays in the history. On a dynamic segment whose conditions still match, the next evaluation adds them back by rule.',
      },
    },
    icon: NAV_ICONS.removeSegmentMember,
    variant: 'destructive',
    surfaces: { default: 'menu', show: 'auto' },
    when: cond.all([cond.equals(ref('record', 'source'), 'manual'), cond.not(cond.present(ref('record', 'removed_at')))]),
    confirm: true,
    submit: {
      mutation: removeSegmentMembers,
      // Idempotent: a closed membership is not closed again.
      retry: 'after-auth-refresh',
      input: ({ record }) => ({ segmentId: String(record?.segment_id ?? ''), subjectIds: [String(record?.[subject] ?? '')] }),
      onUnknown: { check: removeApplied(target) },
    },
    then: { notify: { params: { count: ref('result', 'count') } } },
  } satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
}
