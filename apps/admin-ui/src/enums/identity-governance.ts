import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Enums of identity governance: merges, verification requests and relationships. Values are
 * the rows of the Hasura enum tables in `IDENTITY_GOVERNANCE_ENUM_TABLES`, except
 * `IDENTITY_MERGE_KEEP_ENUM`, a console-only choice (`CONSOLE_ONLY_ENUMS`).
 */

export const MERGE_STATUS_ENUM = 'identity_merge_status';

export const MERGE_STATUSES = ['completed', 'rolled_back'] as const;

export const mergeStatusEnum = defineEnum({
  name: MERGE_STATUS_ENUM,
  values: enumValues(MERGE_STATUSES, { completed: 'success', rolled_back: 'secondary' }),
  texts: {
    completed: {
      label: 'Completed',
      doc: { summary: 'The merged identities are frozen and their photos and templates belong to the kept one.' },
    },
    rolled_back: {
      label: 'Rolled back',
      doc: { summary: 'Undone: every merged identity got back its status, profile link, photos and templates.' },
    },
  },
});

export const VERIFICATION_STATUS_ENUM = 'verification_status';

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected', 'cancelled'] as const;

export const verificationStatusEnum = defineEnum({
  name: VERIFICATION_STATUS_ENUM,
  values: enumValues(VERIFICATION_STATUSES, {
    pending: 'warning',
    approved: 'success',
    rejected: 'destructive',
    cancelled: 'secondary',
  }),
  texts: {
    pending: { label: 'Pending', doc: { summary: 'Waiting for a reviewer to approve or reject it.' } },
    approved: { label: 'Approved', doc: { summary: 'A reviewer confirmed the identity: it is verified.' } },
    rejected: {
      label: 'Rejected',
      doc: { summary: 'A reviewer could not confirm the identity; it went back to unverified.' },
    },
    cancelled: {
      label: 'Cancelled',
      doc: { summary: 'Closed without a decision, because the identity was merged into another one.' },
    },
  },
});

export const IDENTITY_RELATION_ENUM = 'identity_relation';

export const IDENTITY_RELATIONS = ['companion', 'related', 'other'] as const;

export const identityRelationEnum = defineEnum({
  name: IDENTITY_RELATION_ENUM,
  values: enumValues(IDENTITY_RELATIONS, { companion: 'info', related: 'default', other: 'secondary' }),
  texts: {
    companion: { label: 'Companion', doc: { summary: 'Usually seen together, for example arriving at the same time.' } },
    related: { label: 'Related', doc: { summary: 'Family, a colleague or another known tie.' } },
    other: { label: 'Other', doc: { summary: 'Any other relationship; describe it in the note.' } },
  },
});

export const IDENTITY_MERGE_KEEP_ENUM = 'identity_merge_keep';

/** Which identity of a duplicate pair a merge keeps (the other is merged into it). */
export const IDENTITY_MERGE_KEEP = ['first', 'second'] as const;

export const identityMergeKeepEnum = defineEnum({
  name: IDENTITY_MERGE_KEEP_ENUM,
  values: enumValues(IDENTITY_MERGE_KEEP, { first: 'default', second: 'default' }),
  texts: {
    first: {
      label: 'Keep the first identity',
      doc: { summary: 'The left column stays; the right one is merged into it.' },
    },
    second: {
      label: 'Keep the second identity',
      doc: { summary: 'The right column stays; the left one is merged into it.' },
    },
  },
});

/** Each enum above by the Hasura enum table (GraphQL `custom_name`) holding its values. */
export const IDENTITY_GOVERNANCE_ENUM_TABLES: Readonly<Record<string, string>> = {
  [MERGE_STATUS_ENUM]: 'merge_statuses',
  [VERIFICATION_STATUS_ENUM]: 'verification_statuses',
  [IDENTITY_RELATION_ENUM]: 'identity_relations',
};
