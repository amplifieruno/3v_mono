import type { Rule } from '@burojs/core';

/** Whether the rule's record is an erased profile (a tombstone). */
/** Whether the rule's record is a profile whose processing is restricted. */
const restricted = (record: unknown): boolean =>
  (record as { readonly processing_restricted?: unknown } | undefined)?.processing_restricted === true;

const erased = (record: unknown): boolean => {
  const value = (record as { readonly erased_at?: unknown } | undefined)?.erased_at;
  return typeof value === 'string' && value !== '';
};

/** Why nothing on an erased profile can change (shown beside every disabled field and action). */
export const ERASED_REASON =
  'This person’s data was erased on request: the profile is a tombstone and cannot be changed.';

/** Why no face can be enrolled while processing is restricted (`enroll_face` refuses it). */
export const RESTRICTED_ENROLL_REASON =
  'Processing of this person’s data is restricted: no face can be enrolled until the restriction is lifted.';

/** The profile's flows that change it or what belongs to it; disabled on an erased profile. */
export const PROFILE_CHANGING_ACTIONS = ['edit', 'enroll_face', 'upload_document', 'restrict_processing', 'lift_restriction'];

/**
 * What the database freezes, shown before anything is sent (`profiles_erased_guard` refuses any
 * change of an erased profile, its restriction included). A restricted profile keeps its fields
 * editable (rectification stays possible); what the restriction freezes, the identity links,
 * face enrollment and a merge, is refused where those are offered.
 */
export const PROFILE_RULES: Rule[] = [
  {
    target: { kind: 'field' },
    deny: 'edit',
    when: (ctx) => erased(ctx.record),
    fallback: 'disable',
    reason: ERASED_REASON,
  },
  {
    target: { kind: 'action', name: PROFILE_CHANGING_ACTIONS },
    deny: 'run',
    when: (ctx) => erased(ctx.record),
    fallback: 'disable',
    reason: ERASED_REASON,
  },
  {
    target: { kind: 'action', name: 'enroll_face' },
    deny: 'run',
    when: (ctx) => restricted(ctx.record) && !erased(ctx.record),
    fallback: 'disable',
    reason: RESTRICTED_ENROLL_REASON,
  },
];
