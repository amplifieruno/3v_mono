import { type FlowConfig, type Layout, type ScreenRef, cond, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { IDENTITY_RESOURCE } from '../../data/resource-names';
import { carriedId } from '../../fields/carried-id';
import { splitPhotos } from '../../fields/split-photos';
import { splitChoiceOf } from '../../fields/split-photos-format';
import { addIdentityRelationship } from './identity-relationship-ops';
import { relationshipDetailFields } from './identity-relationship';
import { mergeIdentities, splitIdentity } from './identity-merge-ops';
import { identityMergeReviewBlock } from './identity-merge-review-block';

const notMerged = cond.not(cond.equals(ref('record', 'status'), 'merged'));

/** The flow's record id for a placement: a flow form's layout is typed without a record (G20). */
const recordId = ref('record', 'id') as unknown as ScreenRef<'record'>;

/** The form of {@link mergeIntoFlow}: the identities to merge into this one, and why. */
const mergeIntoFields = {
  source_ids: f.relationMany({
    to: IDENTITY_RESOURCE,
    required: true,
    // Not this identity, not one already merged, and real with real, synthetic with synthetic.
    candidates: [
      { field: 'id', op: 'ne', value: ref('record', 'id') },
      { field: 'status', op: 'ne', value: 'merged' },
      { field: 'is_synthetic', op: 'eq', value: ref('record', 'is_synthetic') },
    ],
    texts: {
      label: 'Identities to merge',
      doc: {
        summary:
          'The identities of the same person to merge into this one: their photos and face templates move here and they are frozen as merged.',
      },
    },
  }),
  reason: f.text({
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why they are the same person; kept on the merge and in the audit log.' } },
  }),
  target_id: carriedId('Identity'),
};

/** The kept identity in the review, which reads the flow's values as its record (G35). */
const carriedTarget = ref('record', 'target_id') as unknown as ScreenRef<'record'>;

/**
 * "Merge into this identity…" on an identity: choose the identities of the same person, review
 * what moves (the review block marks this identity as kept), confirm, then `merge_identities`.
 * A bulk flow over a selection would be the natural entry, but a 0.6 bulk flow takes no form or
 * review (`tasks/ui/buro-gaps.md` G34), so the kept identity is the page's record. Disabled with
 * the reason on a merged identity (`./identity-rules.ts`); refusals show on the form.
 */
export const mergeIntoFlow = {
  texts: {
    label: 'Merge into this identity',
    confirm:
      'Merge the chosen identities into this one? Their photos and face templates move here and they are frozen as merged. The merge can be rolled back.',
    notify: 'Identities merged.',
    doc: {
      summary:
        'Merges other identities of the same person into this one: their photos, face templates, watch-list entries and manual segment memberships move here, and they become merged. Rolled back from Identity merges.',
    },
  },
  icon: NAV_ICONS.mergeIdentities,
  variant: 'destructive',
  surfaces: { default: false, show: 'menu' },
  when: notMerged,
  confirm: true,
  form: {
    fields: mergeIntoFields,
    initial: {
      source_ids: { kind: 'literal', value: [] },
      reason: { kind: 'literal', value: null },
      target_id: ref('record', 'id'),
    },
    body: (l: Layout<typeof mergeIntoFields>) => [
      'source_ids',
      'reason',
      l.place(identityMergeReviewBlock, { key: 'merge-into-form', props: { targetId: recordId, keep: null } }),
    ],
  },
  review: (l: Layout<typeof mergeIntoFields>) => [
    l.place(identityMergeReviewBlock, { key: 'merge-into-review', props: { targetId: carriedTarget, keep: null } }),
  ],
  submit: {
    mutation: mergeIdentities,
    retry: 'never',
    input: ({ values, record }) => ({
      targetId: String(record?.id ?? ''),
      sourceIds: Array.isArray(values.source_ids) ? values.source_ids.map(String) : [],
      reason: typeof values.reason === 'string' ? values.reason : null,
    }),
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof mergeIntoFields>;

/** The form of {@link splitFlow}: the photos that move to the new identity. */
const splitFields = {
  parts: splitPhotos({
    texts: {
      label: 'Photos to split off',
      doc: {
        summary:
          'The photos that show someone else. They move to a new identity with their face templates; the others stay here.',
      },
    },
  }),
};

/**
 * "Split" on an identity holding two people's photos: choose the other person's photos on their
 * thumbnails, review, confirm, then `split_identity`. The new identity (source Split, unverified,
 * unlinked) opens afterwards. Disabled with the reason on a merged identity.
 */
export const splitFlow = {
  texts: {
    label: 'Split',
    confirm: 'Move the chosen photos and their face templates to a new identity?',
    notify: 'Split off as {{code}}.',
    doc: {
      summary:
        'Moves photos that show someone else, with their face templates, to a new unverified identity, so each person is recognised on their own.',
    },
  },
  icon: NAV_ICONS.split,
  surfaces: { default: false, show: 'menu' },
  when: notMerged,
  confirm: true,
  // The field starts as the identity's id, so it can offer that identity's photos.
  form: { fields: splitFields, initial: { parts: ref('record', 'id') } },
  review: () => ['parts'],
  submit: {
    mutation: splitIdentity,
    retry: 'never',
    input: ({ values, record }) => {
      const choice = splitChoiceOf(values.parts);
      return {
        identityId: String(record?.id ?? ''),
        photoIds: choice.photos.map((photo) => photo.id),
        embeddingIds: [...choice.embeddingIds],
      };
    },
  },
  then: {
    notify: { params: { code: ref('result', 'code') } },
    open: { resource: IDENTITY_RESOURCE, id: ref('result', 'id') },
  },
} satisfies FlowConfig<unknown, Record<never, never>, typeof splitFields>;

/** The form of {@link addRelationshipFlow}: the other identity and what the relationship says. */
const relationshipFields = {
  other_id: f.relation({
    to: IDENTITY_RESOURCE,
    required: true,
    candidates: [{ field: 'id', op: 'ne', value: ref('record', 'id') }],
    texts: { label: 'Related identity', doc: { summary: 'The identity this one is related to.' } },
  }),
  ...relationshipDetailFields,
};

/**
 * "Add relationship" on an identity: the other identity, the relation, how sure it is and a note.
 * The pair is stored once (smaller id first) whichever identity it is added from, so a second
 * relationship of the same two is refused on the form.
 */
export const addRelationshipFlow = {
  texts: {
    label: 'Add relationship',
    notify: 'Relationship added.',
    doc: { summary: 'Records that this identity is related to another one: seen together, family, colleagues.' },
  },
  icon: NAV_ICONS.relationships,
  surfaces: { default: false, show: 'menu' },
  form: {
    fields: relationshipFields,
    initial: {
      relation: { kind: 'literal', value: 'related' },
      confidence: { kind: 'literal', value: null },
      note: { kind: 'literal', value: null },
    },
  },
  submit: {
    mutation: addIdentityRelationship,
    retry: 'never',
    input: ({ values, record }) => ({
      identityId: String(record?.id ?? ''),
      otherId: String(values.other_id ?? ''),
      relation: values.relation,
      confidence: typeof values.confidence === 'number' ? values.confidence : null,
      note: typeof values.note === 'string' ? values.note : null,
    }),
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, typeof relationshipFields>;
