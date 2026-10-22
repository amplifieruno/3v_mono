import { cond, defineResource, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { IDENTITY_DUPLICATE_RESOURCE, IDENTITY_MERGE_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { enumField } from '../../enums/field';
import { CANDIDATE_STATUSES, CANDIDATE_STATUS_ENUM } from '../../enums/people-records';
import { mergeDuplicateFlow } from './identity-duplicate-merge-flow';
import { identityMergeReviewBlock } from './identity-merge-review-block';
import { recordDate } from './record-date';
import { dateTime } from '../../fields/date-time';

/** One side of a pair: an identity (the pair is unordered; the database stores the smaller id first). */
const side = (label: string) =>
  f.relation({
    to: IDENTITY_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label, doc: { summary: `The ${label.toLowerCase()} of the pair (the pair is unordered).` } },
  });

/**
 * Columns of `itap.identity_duplicate_candidates` the `org_admin` role reads (`organization_id`
 * left out). Pairs are found by the platform; only the status changes here, through the flows.
 */
export const identityDuplicateFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  identity_a_id: side('First identity'),
  identity_b_id: side('Second identity'),
  similarity: f.number({
    write: 'never',
    texts: {
      label: 'Similarity',
      doc: { summary: 'How alike the two faces are, from -1 to 1 (cosine similarity of their face templates; 1 = identical).' },
    },
  }),
  status: enumField(CANDIDATE_STATUSES, CANDIDATE_STATUS_ENUM, {
    write: 'never',
    texts: {
      label: 'Status',
      doc: { summary: 'Open until someone merges the two (Merged) or decides they are different people (Not a duplicate).' },
    },
  }),
  merge_id: f.relation({
    to: IDENTITY_MERGE_RESOURCE,
    write: 'never',
    nullable: true,
    open: 'page',
    texts: { label: 'Merge', doc: { summary: 'The merge that settled the pair; a rollback of it reopens the pair.' } },
  }),
  detected_at: dateTime({ system: true, texts: { label: 'Found', doc: { summary: 'When the platform found the pair.' } } }),
  created_at: f.dateTime({ system: true, texts: 'Created', in: [] }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [] }),
};

const isOpen = cond.equals(ref('record', 'status'), 'open');

/**
 * The review queue of possible duplicate identities: two faces the platform found alike. Merge
 * them ("Merge identities", with a review of what moves, undone by a rollback) or dismiss the pair.
 */
export const identityDuplicate = defineResource(IDENTITY_DUPLICATE_RESOURCE, {
  texts: {
    label: 'Possible duplicate identity',
    labelPlural: 'Identity duplicates',
    doc: {
      summary:
        'Two identities whose faces are so alike they may be the same person, waiting for someone to merge them or dismiss the pair.',
    },
  },
  basePath: '/identity-duplicates',
  section: NAV_SECTIONS.people,
  order: 25,
  icon: NAV_ICONS.identityDuplicates,
  displayField: 'identity_a_id',
  recordTitle: (record) => recordDate('Possible duplicate found', record.detected_at),
  data: { provider: 'hasura' },
  operations: { create: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: identityDuplicateFields,
  actions: (r) => ({
    item: [
      r.action.flow('merge_identities', mergeDuplicateFlow),
      r.action.flow('dismiss', {
        texts: {
          label: 'Not a duplicate',
          confirm: 'Mark the two as different people? The pair leaves the open queue; it can be reopened.',
          notify: 'Pair dismissed.',
          doc: { summary: 'Records that the two identities are different people; nothing changes on the identities.' },
        },
        icon: NAV_ICONS.dismiss,
        surfaces: { default: 'menu', show: 'auto' },
        when: isOpen,
        confirm: true,
        submit: {
          update: IDENTITY_DUPLICATE_RESOURCE,
          input: { status: 'dismissed' },
          reread: { expect: isOpen },
          onUnknown: { check: fieldApplied(IDENTITY_DUPLICATE_RESOURCE, 'status', 'dismissed') },
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
          update: IDENTITY_DUPLICATE_RESOURCE,
          input: { status: 'open' },
          reread: { expect: cond.equals(ref('record', 'status'), 'dismissed') },
          onUnknown: { check: fieldApplied(IDENTITY_DUPLICATE_RESOURCE, 'status', 'open') },
        },
        then: { notify: true },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['identity_a_id', 'identity_b_id', 'similarity', 'status', 'detected_at'],
      defaultSort: [{ field: 'detected_at', direction: 'desc' }],
      filters: { fields: ['status', 'detected_at'] },
      savedViews: [{ id: 'open', texts: 'Open', state: { filters: [{ field: 'status', op: 'eq', value: 'open' }] } }],
    },
    show: {
      header: (l) => [l.grid(['status', 'similarity', 'detected_at', 'merge_id'])],
      body: (l) => [
        l.place(identityMergeReviewBlock, {
          key: 'compare',
          props: {
            first: l.ref('record', 'identity_a_id'),
            second: l.ref('record', 'identity_b_id'),
            keep: null,
            sourceIds: null,
          },
        }),
        l.grid(['identity_a_id', 'identity_b_id']),
      ],
    },
  },
});
