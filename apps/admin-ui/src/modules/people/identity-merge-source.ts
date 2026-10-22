import { defineResource } from '@burojs/core';
import { f } from '@burojs/field-types';
import {
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import { IDENTITY_STATUSES, IDENTITY_STATUS_ENUM } from '../../enums/identities';
import { dateTime } from '../../fields/date-time';

/** Columns of `itap.identity_merge_sources` the `org_admin` role reads (`organization_id` left out). */
export const identityMergeSourceFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  merge_id: f.relation({
    to: IDENTITY_MERGE_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label: 'Merge', doc: { summary: 'The merge this identity was merged in.' } },
  }),
  source_identity_id: f.relation({
    to: IDENTITY_RESOURCE,
    write: 'never',
    open: 'page',
    texts: { label: 'Merged identity', doc: { summary: 'The identity merged into the kept one.' } },
  }),
  previous_status: enumField(IDENTITY_STATUSES, IDENTITY_STATUS_ENUM, {
    write: 'never',
    texts: { label: 'Status before', doc: { summary: 'Its status before the merge; a rollback restores it.' } },
  }),
  previous_profile_id: f.relation({
    to: PROFILE_RESOURCE,
    write: 'never',
    nullable: true,
    open: 'page',
    texts: { label: 'Profile before', doc: { summary: 'The profile it was linked to before the merge; a rollback relinks it.' } },
  }),
  previous_is_primary: f.boolean({
    system: true,
    texts: {
      label: 'Primary before',
      doc: { summary: 'Whether it was its profile’s primary identity; restored unless another identity is primary by then.' },
    },
  }),
  created_at: dateTime({ system: true, texts: { label: 'Merged at', doc: { summary: 'When it was merged.' } } }),
};

/**
 * The identities one merge merged into the kept one, with what a rollback gives back. Listed on
 * the merge's page and on each merged identity's Merges tab; written only by `merge_identities`.
 */
export const identityMergeSource = defineResource(IDENTITY_MERGE_SOURCE_RESOURCE, {
  texts: {
    label: 'Merged identity',
    labelPlural: 'Merged identities',
    doc: {
      summary:
        'An identity merged into another one by a merge, with its status and profile link before the merge, which a rollback restores.',
    },
  },
  basePath: '/identity-merge-sources',
  displayField: 'source_identity_id',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: identityMergeSourceFields,
  views: {
    list: { page: false, columns: ['source_identity_id', 'merge_id', 'previous_status', 'previous_profile_id', 'created_at'] },
    show: { page: false },
  },
});
