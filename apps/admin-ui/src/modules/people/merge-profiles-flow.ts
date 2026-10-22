import { type CheckDI, type FlowConfig, type Layout, type ScreenRef, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { PROFILE_DUPLICATE_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { enumField } from '../../enums/field';
import { MERGE_KEEP, MERGE_KEEP_ENUM } from '../../enums/people-records';
import { mergeBlocker, mergeDirection, mergeProfiles } from './merge-profiles';
import { profile } from './profile';
import { profileCompareBlock } from './profile-compare-block';

/** The form of {@link mergeProfilesFlow}: which profile stays. */
const mergeFields = {
  keep: enumField(MERGE_KEEP, MERGE_KEEP_ENUM, {
    required: true,
    default: 'first',
    texts: {
      label: 'Keep',
      doc: {
        summary:
          'The profile that stays: usually the older or more complete one. The other is folded into it and set inactive.',
      },
    },
  }),
};

/**
 * The pair's two profiles for the comparison. A flow form reads the flow's record, but its layout
 * is typed as a create screen without one (`tasks/ui/buro-gaps.md` G20).
 */
const pairProps = {
  first: ref('record', 'profile_a_id') as unknown as ScreenRef<'record'>,
  second: ref('record', 'profile_b_id') as unknown as ScreenRef<'record'>,
};

/** Whether the pair's profiles block the merge for `reason`, read through the check's data access. */
const blockedBy =
  (reason: 'erased' | 'restricted') =>
  async ({ record, data }: CheckDI): Promise<boolean> =>
    (await mergeBlocker(record, async (id) => {
      const { data: row } = await data.one(profile, { id });
      return row;
    })) === reason;

/**
 * "Merge profiles" on an open pair: choose the profile to keep (the comparison marks it and says
 * what moves), review, confirm, then `merge_profiles`. Refused before anything is sent when either
 * profile is erased or restricted (the database refuses those merges). Irreversible, so never
 * resent automatically; a lost answer is checked by reading the pair back.
 */
export const mergeProfilesFlow = {
  texts: {
    label: 'Merge profiles',
    confirm:
      'Merge the two profiles? Identities, documents and consents move to the kept profile and the other becomes inactive. This cannot be undone.',
    notify: 'Profiles merged.',
    doc: {
      summary:
        'Folds one profile of the pair into the other: identities, documents, consents and watch-list entries move to the kept profile, and the other is set inactive. There is no undo.',
    },
  },
  icon: NAV_ICONS.mergeProfiles,
  variant: 'destructive',
  surfaces: { default: 'menu', show: 'auto' },
  when: cond.equals(ref('record', 'status'), 'open'),
  confirm: true,
  checks: [
    {
      id: 'mergeErased',
      severity: 'error',
      when: blockedBy('erased'),
      texts: 'One of the profiles was erased: an erased profile cannot be merged. Dismiss the pair instead.',
    },
    {
      id: 'mergeRestricted',
      severity: 'error',
      when: blockedBy('restricted'),
      texts: 'Processing of one of the profiles is restricted: its identities cannot move. Lift the restriction first.',
    },
  ],
  form: {
    fields: mergeFields,
    // The first profile by default, so the comparison says what moves from the start.
    initial: { keep: { kind: 'literal', value: 'first' } },
    body: (l: Layout<typeof mergeFields>) => ['keep', l.place(profileCompareBlock, { key: 'merge-compare', props: pairProps })],
  },
  review: (l: Layout<typeof mergeFields>) => [l.place(profileCompareBlock, { key: 'merge-review', props: pairProps })],
  submit: {
    mutation: mergeProfiles,
    retry: 'never',
    input: ({ values, record }) => mergeDirection(record, values.keep),
    onUnknown: { check: fieldApplied(PROFILE_DUPLICATE_RESOURCE, 'status', 'merged') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof mergeFields>;
