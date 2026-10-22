import { cond, defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { PROFILE_DUPLICATE_RESOURCE, PROFILE_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { enumField } from '../../enums/field';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_ENUM } from '../../enums/people-records';
import { stringList } from '../../fields/string-list';
import { mergeProfilesFlow } from './merge-profiles-flow';
import { profileCompareBlock } from './profile-compare-block';

/** One side of a pair: a profile, read across the `profile_a` / `profile_b` relationship. */
const side = (relationship: string, label: string) =>
  f.relation({
    to: PROFILE_RESOURCE,
    write: 'never',
    open: 'page',
    providerOptions: { relationship },
    texts: { label, doc: { summary: `The ${label.toLowerCase()} of the pair (the pair is unordered).` } },
  });

/**
 * Columns of `itap.profile_duplicate_candidates` the `org_admin` role reads (`organization_id`
 * left out). Pairs are found by the platform; only the status changes here, through the flows.
 */
export const profileDuplicateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  profile_a_id: side('profile_a', 'First profile'),
  profile_b_id: side('profile_b', 'Second profile'),
  similarity: f.number({
    write: 'never',
    texts: {
      label: 'Similarity',
      doc: { summary: 'How alike the two profiles are, from 0 to 1 (1 = the compared fields are identical).' },
    },
  }),
  reasons: {
    ...stringList({ item: 'Reason', texts: { label: 'Matched on', doc: { summary: 'The fields that matched, such as email or employee ID.' } } }),
    write: 'never' as const,
  },
  status: enumField(CANDIDATE_STATUSES, CANDIDATE_STATUS_ENUM, {
    write: 'never',
    texts: {
      label: 'Status',
      doc: {
        summary: 'Open until someone merges the two (Merged) or decides they are different people (Not a duplicate).',
      },
    },
  }),
  detected_at: f.dateTime({ system: true, texts: { label: 'Found', doc: { summary: 'When the platform found the pair.' } } }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [] }),
};

const isOpen = cond.equals(ref('record', 'status'), 'open');

/**
 * The review queue of possible duplicate profiles: compare the two side by side, merge them
 * ("Merge profiles", irreversible, with a review of what moves) or dismiss the pair.
 */
export const profileDuplicate = defineResource(PROFILE_DUPLICATE_RESOURCE, {
  texts: {
    label: 'Possible duplicate',
    labelPlural: 'Profile duplicates',
    doc: {
      summary:
        'Two profiles the platform thinks describe the same person (matching name, email or employee ID), waiting for someone to merge them or dismiss the pair.',
    },
  },
  basePath: '/profile-duplicates',
  section: NAV_SECTIONS.people,
  order: 20,
  icon: NAV_ICONS.profileDuplicates,
  displayField: 'profile_a_id',
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: profileDuplicateFields,
  actions: (r) => ({
    item: [
      r.action.flow('merge_profiles', mergeProfilesFlow),
      r.action.flow('dismiss', {
        texts: {
          label: 'Not a duplicate',
          confirm: 'Mark the two as different people? The pair leaves the open queue; it can be reopened.',
          notify: 'Pair dismissed.',
          doc: { summary: 'Records that the two profiles are different people; nothing changes on the profiles.' },
        },
        icon: NAV_ICONS.dismiss,
        surfaces: { default: 'menu', show: 'auto' },
        when: isOpen,
        confirm: true,
        submit: {
          update: PROFILE_DUPLICATE_RESOURCE,
          input: { status: 'dismissed' },
          reread: { expect: isOpen },
          onUnknown: { check: fieldApplied(PROFILE_DUPLICATE_RESOURCE, 'status', 'dismissed') },
        },
        then: { notify: true },
      }),
      r.action.flow('reopen', {
        texts: {
          label: 'Reopen',
          notify: 'Pair reopened.',
          doc: { summary: 'Puts a dismissed pair back in the open queue.' },
        },
        icon: NAV_ICONS.reopen,
        surfaces: { default: 'menu', show: 'menu' },
        when: cond.equals(ref('record', 'status'), 'dismissed'),
        submit: {
          update: PROFILE_DUPLICATE_RESOURCE,
          input: { status: 'open' },
          reread: { expect: cond.equals(ref('record', 'status'), 'dismissed') },
          onUnknown: { check: fieldApplied(PROFILE_DUPLICATE_RESOURCE, 'status', 'open') },
        },
        then: { notify: true },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['profile_a_id', 'profile_b_id', 'similarity', 'reasons', 'status', 'detected_at'],
      defaultSort: [{ field: 'detected_at', direction: 'desc' }],
      filters: { fields: ['status', 'detected_at'] },
      savedViews: [
        {
          id: 'open',
          texts: 'Open',
          state: { filters: [{ field: 'status', op: 'eq', value: 'open' }] },
        },
      ],
    },
    show: {
      header: (l) => [l.grid(['status', 'similarity', 'reasons', 'detected_at'])],
      body: (l) => [
        l.place(profileCompareBlock, {
          key: 'compare',
          props: { first: l.ref('record', 'profile_a_id'), second: l.ref('record', 'profile_b_id'), keep: null },
        }),
        l.grid(['profile_a_id', 'profile_b_id']),
      ],
    },
  },
});
