import { type FlowConfig, type Layout, type ScreenRef, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { IDENTITY_DUPLICATE_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { carriedId } from '../../fields/carried-id';
import { enumField } from '../../enums/field';
import { IDENTITY_MERGE_KEEP, IDENTITY_MERGE_KEEP_ENUM } from '../../enums/identity-governance';
import { mergeSides } from './identity-merge-plan';
import { mergeIdentities } from './identity-merge-ops';
import { identityMergeReviewBlock } from './identity-merge-review-block';

/** The form of {@link mergeDuplicateFlow}: which identity stays. */
const keepFields = {
  keep: enumField(IDENTITY_MERGE_KEEP, IDENTITY_MERGE_KEEP_ENUM, {
    required: true,
    default: 'first',
    texts: {
      label: 'Keep',
      doc: {
        summary:
          'The identity that stays: usually the one linked to a profile, or the one with more photos. The other is merged into it.',
      },
    },
  }),
  first: carriedId('First identity'),
  second: carriedId('Second identity'),
};

/** The pair's two identities for the form. A flow form's layout is typed without a record (G20). */
const pairProps = {
  first: ref('record', 'identity_a_id') as unknown as ScreenRef<'record'>,
  second: ref('record', 'identity_b_id') as unknown as ScreenRef<'record'>,
  sourceIds: null,
};

/** The same for the review, which reads the flow's values as its record (G35). */
const reviewProps = {
  first: ref('record', 'first') as unknown as ScreenRef<'record'>,
  second: ref('record', 'second') as unknown as ScreenRef<'record'>,
  keep: ref('record', 'keep') as unknown as ScreenRef<'record'>,
  sourceIds: null,
};

/** A duplicate pair's ids as the merge reads them. */
interface Pair {
  readonly identity_a_id?: unknown;
  readonly identity_b_id?: unknown;
}

/** The merge's input for the kept side: the kept identity is the target, the other the source. */
export function duplicateMergeInput(pair: Pair | undefined, keep: unknown): { targetId: string; sourceIds: string[] } {
  const sides = mergeSides({
    first: String(pair?.identity_a_id ?? ''),
    second: String(pair?.identity_b_id ?? ''),
    keep: keep === 'second' ? 'second' : 'first',
  });
  return { targetId: sides.targetId ?? '', sourceIds: [...sides.sourceIds] };
}

/**
 * "Merge identities" on an open duplicate pair: choose the identity to keep (the review marks it
 * and says what moves), review, confirm, then `merge_identities`. The database refuses a pair
 * linked to two different profiles, an already merged identity and a synthetic with a real one;
 * the review says so before sending and the form shows the refusal. A rollback undoes it.
 */
export const mergeDuplicateFlow = {
  texts: {
    label: 'Merge identities',
    confirm:
      'Merge the two identities? The other identity’s photos and face templates move to the kept one, and it is frozen as merged. The merge can be rolled back.',
    notify: 'Identities merged.',
    doc: {
      summary:
        'Merges one identity of the pair into the other: photos, face templates, watch-list entries and manual segment memberships move to the kept identity, and the other becomes merged. Rolled back from Identity merges.',
    },
  },
  icon: NAV_ICONS.mergeIdentities,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: cond.equals(ref('record', 'status'), 'open'),
  confirm: true,
  form: {
    fields: keepFields,
    initial: {
      keep: { kind: 'literal', value: 'first' },
      first: ref('record', 'identity_a_id'),
      second: ref('record', 'identity_b_id'),
    },
    body: (l: Layout<typeof keepFields>) => ['keep', l.place(identityMergeReviewBlock, { key: 'pair-merge-form', props: pairProps })],
  },
  review: (l: Layout<typeof keepFields>) => [
    l.place(identityMergeReviewBlock, { key: 'pair-merge-review', props: reviewProps }),
  ],
  submit: {
    mutation: mergeIdentities,
    retry: 'never',
    input: ({ values, record }) => duplicateMergeInput(record, values.keep),
    onUnknown: { check: fieldApplied(IDENTITY_DUPLICATE_RESOURCE, 'status', 'merged') },
  },
  then: { notify: true, open: { resource: IDENTITY_RESOURCE, id: ref('result', 'target_identity_id') } },
} satisfies FlowConfig<unknown, Record<never, never>, typeof keepFields>;
