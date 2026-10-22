import { type FlowConfig, type Layout, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { IDENTITY_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { segmentEvaluationBlock } from './segment-evaluation-block';
import { evaluateSegment } from './segment-evaluation-ops';
import { type SegmentTarget, addApplied, evaluationApplied, rememberEvaluation, rememberSent } from './segment-membership-checks';
import { addSegmentMembers } from './segment-membership-ops';

const notArchived = cond.not(cond.equals(ref('record', 'status'), 'archived'));

/**
 * "Evaluate now" on an active dynamic segment (`evaluate_segment`): the conditions are applied at
 * once instead of at the next hourly run, and the answer says who joined and left by rule, or
 * that a newer evaluation had already run (stale). A lost answer is checked on the segment's
 * last evaluation time.
 */
export const evaluateNowFlow = {
  texts: {
    label: 'Evaluate now',
    doc: {
      summary:
        'Applies the conditions now instead of at the next hourly run: whoever matches joins, rule members who no longer match leave. Members added by hand stay.',
    },
  },
  icon: NAV_ICONS.evaluateSegment,
  surfaces: { default: 'menu', show: 'auto' },
  when: cond.all([cond.equals(ref('record', 'kind'), 'dynamic'), cond.equals(ref('record', 'status'), 'active')]),
  // The review gives the flow its dialog: it says what happens, then shows the answer (`then.open`).
  review: (l: Layout<Record<never, never>>) => [l.place(segmentEvaluationBlock, { key: 'evaluate-intro', props: {} })],
  submit: {
    mutation: evaluateSegment,
    retry: 'after-auth-refresh',
    input: ({ record }) => {
      const segmentId = String(record?.id ?? '');
      rememberEvaluation(segmentId, record?.last_evaluated_at);
      // The conditions only name a refused condition in the refusal; they are not sent.
      return { segmentId, conditions: record?.conditions };
    },
    onUnknown: { check: evaluationApplied },
  },
  then: {
    open: {
      block: segmentEvaluationBlock,
      props: {
        added: ref('result', 'added'),
        removed: ref('result', 'removed'),
        memberCount: ref('result', 'member_count'),
        stale: ref('result', 'stale'),
      },
    },
  },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/** The people or faces "Add members" offers, by the segment's target. */
const SUBJECTS = {
  profiles: {
    to: PROFILE_RESOURCE,
    label: 'People to add',
    summary:
      'The known people to add by hand. People whose processing is restricted are not offered: they cannot join segments. Someone already a member by rule becomes a manual member.',
    // `segment_members_restricted`: a restricted person cannot join.
    candidates: [{ field: 'processing_restricted', op: 'eq', value: false }],
  },
  identities: {
    to: IDENTITY_RESOURCE,
    label: 'Identities to add',
    summary:
      'The faces (identities, known or unknown) to add by hand. Merged identities are not offered: add the identity they were merged into. Someone already a member by rule becomes a manual member.',
    // `identity_merged`: a merged identity cannot join.
    candidates: [{ field: 'status', op: 'ne', value: 'merged' }],
  },
} as const;

/** The form of "Add members" for a segment of `target`. */
function addMembersFields(target: SegmentTarget) {
  const subject = SUBJECTS[target];
  return {
    subject_ids: f.relationMany({
      to: subject.to,
      required: true,
      candidates: [...subject.candidates],
      texts: { label: subject.label, doc: { summary: subject.summary } },
    }),
  };
}

/**
 * "Add members" on a segment that is not archived, one flow per target (each offers only its own
 * people or faces): `add_segment_members` with the chosen ones. Works on a dynamic segment too:
 * someone added by hand stays a member whatever the conditions say, and a current rule member is
 * pinned (the rule membership ends and a manual one starts at the same instant; the members list
 * shows source Manual). This is also the console's bulk add: a list's selection cannot carry the
 * segment to add to (`tasks/ui/buro-gaps.md` G34).
 */
function addMembersFlow(name: string, target: SegmentTarget) {
  const fields = addMembersFields(target);
  return {
    texts: {
      label: 'Add members',
      notify: 'Added by hand: {{count}}. Already added by hand before (left as they were): {{kept}}.',
      doc: {
        summary:
          'Adds people or faces to the segment by hand, several at once. They stay members until removed by hand, even when a dynamic segment’s conditions no longer match them.',
      },
    },
    icon: NAV_ICONS.addSegmentMembers,
    surfaces: { default: 'menu', show: 'auto' },
    when: cond.all([cond.equals(ref('record', 'target'), target), notArchived]),
    form: { fields, initial: { subject_ids: { kind: 'literal', value: [] } } },
    submit: {
      mutation: addSegmentMembers,
      // Idempotent: adding a manual member again changes nothing.
      retry: 'after-auth-refresh',
      input: ({ values, record }) => {
        const segmentId = String(record?.id ?? '');
        const subjectIds = Array.isArray(values.subject_ids) ? values.subject_ids.map(String) : [];
        if (subjectIds[0] !== undefined) rememberSent(name, segmentId, { segmentId, subjectId: subjectIds[0], target });
        return { segmentId, subjectIds };
      },
      onUnknown: { check: addApplied(name) },
    },
    then: { notify: { params: { count: ref('result', 'count'), kept: ref('result', 'kept') } } },
  } satisfies FlowConfig<unknown, Record<never, never>, typeof fields>;
}

export const ADD_PROFILES_FLOW = 'add_profiles';
export const ADD_IDENTITIES_FLOW = 'add_identities';
export const addProfilesFlow = addMembersFlow(ADD_PROFILES_FLOW, 'profiles');
export const addIdentitiesFlow = addMembersFlow(ADD_IDENTITIES_FLOW, 'identities');
