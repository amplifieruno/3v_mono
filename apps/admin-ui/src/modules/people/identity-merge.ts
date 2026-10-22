import { type ScreenRef, cond, defineResource, ref, relatedList } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import {
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { fieldApplied } from '../../data/status-applied';
import { enumField } from '../../enums/field';
import { MERGE_STATUSES, MERGE_STATUS_ENUM } from '../../enums/identity-governance';
import { carriedId } from '../../fields/carried-id';
import { rollbackMerge } from './identity-merge-ops';
import { recordDate } from './record-date';
import { mergeRollbackReviewBlock } from './merge-rollback-review-block';

/**
 * Columns of `itap.identity_merges` the `org_admin` role reads (`organization_id` and the
 * internal `target_previous_matching_enabled` left out). Merges are written only by
 * `merge_identities` and `rollback_merge`.
 */
export const identityMergeFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  target_identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label: 'Kept identity', doc: { summary: 'The identity the others were merged into; it kept its own record.' } },
  }),
  status: enumField(MERGE_STATUSES, MERGE_STATUS_ENUM, {
    write: 'never',
    texts: { label: 'Status', doc: { summary: 'Completed while the merge stands; Rolled back once undone.' } },
  }),
  reason: f.string({
    write: 'never',
    nullable: true,
    texts: { label: 'Reason', doc: { summary: 'Why the identities were merged, as given when merging.' } },
  }),
  inherited_profile_id: f.relation({
    to: PROFILE_RESOURCE,
    write: 'never',
    nullable: true,
    open: 'page',
    texts: {
      label: 'Profile taken over',
      doc: {
        summary:
          'The profile the kept identity took over from a merged one because it had none; a rollback unlinks it again.',
      },
    },
  }),
  inherited_primary: f.boolean({
    system: true,
    in: ['show'],
    texts: {
      label: 'Primary taken over',
      doc: { summary: 'Whether the kept identity became its profile’s primary identity because a merged one was.' },
    },
  }),
  merged_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Merged by', doc: { summary: 'The member who merged the identities.' } },
  }),
  created_at: f.dateTime({ system: true, texts: { label: 'Merged at', doc: { summary: 'When the merge ran.' } } }),
  rolled_back_at: f.dateTime({
    system: true,
    nullable: true,
    texts: { label: 'Rolled back at', doc: { summary: 'When the merge was undone; empty while it stands.' } },
  }),
  rolled_back_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    in: ['show'],
    texts: { label: 'Rolled back by', doc: { summary: 'The member who undid the merge.' } },
  }),
  updated_at: f.dateTime({ system: true, texts: 'Updated', in: [] }),
};

const completed = cond.equals(ref('record', 'status'), 'completed');

/**
 * Identity merges: one row per merge, with the identities merged into the kept one. Read only;
 * "Roll back" undoes a completed merge exactly (with a review of what goes back). Merges are
 * made from an identity ("Merge into this identity") or a duplicate pair ("Merge identities").
 */
export const identityMerge = defineResource(IDENTITY_MERGE_RESOURCE, {
  texts: {
    label: 'Identity merge',
    labelPlural: 'Identity merges',
    doc: {
      summary:
        'A merge of identities that turned out to be the same person: which identity was kept, which were merged into it, by whom and why. A completed merge can be rolled back.',
    },
  },
  basePath: '/identity-merges',
  section: NAV_SECTIONS.people,
  order: 30,
  icon: NAV_ICONS.identityMerges,
  displayField: 'created_at',
  recordTitle: (record) => recordDate('Merge of', record.created_at),
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: identityMergeFields,
  actions: (r) => ({
    item: [
      r.action.flow('rollback', {
        texts: {
          label: 'Roll back',
          confirm:
            'Roll back this merge? Every merged identity gets back its status, profile link, photos and face templates.',
          notify: 'Merge rolled back.',
          doc: {
            summary:
              'Undoes the merge exactly: the photos, templates, watch-list entries and segment memberships go back to the merged identities, which get back their status and profile link, and the duplicate pairs it closed reopen. Merges are undone newest first.',
          },
        },
        icon: NAV_ICONS.rollback,
        variant: 'destructive',
        surfaces: { default: 'menu', show: 'auto' },
        when: completed,
        confirm: true,
        // The dialog opens on what goes back; the review step shows it again before the confirm.
        // A review reads only the flow's values (G35): the merge's id is carried as one.
        form: {
          fields: { merge_id: carriedId('Merge') },
          initial: { merge_id: ref('record', 'id') },
          body: (l) => [
            l.place(mergeRollbackReviewBlock, {
              key: 'rollback-form',
              props: { mergeId: ref('record', 'id') as unknown as ScreenRef<'record'> },
            }),
          ],
        },
        review: (l) => [
          l.place(mergeRollbackReviewBlock, {
            key: 'rollback-review',
            props: { mergeId: ref('record', 'merge_id') as unknown as ScreenRef<'record'> },
          }),
        ],
        submit: {
          mutation: rollbackMerge,
          retry: 'never',
          input: { mergeId: ref('record', 'id') },
          onUnknown: { check: fieldApplied(IDENTITY_MERGE_RESOURCE, 'status', 'rolled_back') },
        },
        then: { notify: true },
      }),
    ],
  }),
  views: {
    list: {
      columns: ['created_at', 'target_identity_id', 'status', 'reason', 'merged_by', 'rolled_back_at'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      filters: { fields: ['status', 'target_identity_id', 'created_at'] },
      savedViews: [
        { id: 'completed', texts: 'Completed', state: { filters: [{ field: 'status', op: 'eq', value: 'completed' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['status', 'created_at', 'merged_by'])],
      body: (l) => [
        l.grid(['target_identity_id', 'reason']),
        l.grid(['inherited_profile_id', 'inherited_primary']),
        l.grid(['rolled_back_at', 'rolled_back_by']),
        l.place(relatedList(resourceByName(IDENTITY_MERGE_SOURCE_RESOURCE)), {
          key: 'merge-sources',
          texts: { title: 'Merged identities' },
          props: {
            where: [{ field: 'merge_id', op: 'eq', value: l.ref('record', 'id') }],
            columns: ['source_identity_id', 'previous_status', 'previous_profile_id', 'previous_is_primary'],
            open: 'none',
          },
        }),
      ],
    },
  },
});
