import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import {
  IDENTITY_DUPLICATE_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  VERIFICATION_REQUEST_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { sqlRefusals } from '../../data/sql-refusals';
import { PEOPLE_BINDING } from './profile-activity';

const NOTHING = ' Nothing was changed.';

/** Refused when a linked person's processing is restricted (`identities_restricted_link`). */
const RESTRICTED =
  'Processing of a linked person is restricted: their identities cannot be merged or unmerged until the restriction is lifted.' +
  NOTHING;

/** The first row a `SETOF` function answered, or `null`. */
const firstRow = (field: string) => (data: unknown) => {
  const rows = rootOf(data, field);
  return Array.isArray(rows) ? (rows[0] ?? null) : null;
};

/** What a merge or its rollback answers: the merge row. */
export const mergeRow = z.object({ id: z.string(), target_identity_id: z.string(), status: z.string() });

/** Every view a merge or a rollback changes. */
const MERGE_EFFECTS = [
  { resource: IDENTITY_RESOURCE },
  { resource: IDENTITY_MERGE_RESOURCE },
  { resource: IDENTITY_MERGE_SOURCE_RESOURCE },
  { resource: IDENTITY_DUPLICATE_RESOURCE },
  { resource: VERIFICATION_REQUEST_RESOURCE },
  { resource: PROFILE_RESOURCE },
];

export const mergeIdentitiesInput = z.object({
  targetId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).min(1),
  reason: z.string().nullable().optional(),
});

/** The merge's sources: the chosen identities without the kept one, each once. */
export function mergeSources(targetId: string, sourceIds: readonly string[]): string[] {
  return [...new Set(sourceIds)].filter((id) => id !== targetId);
}

/** `merge_identities(hasura_session, p_target, p_sources, p_reason)` (org_admin). */
export const mergeIdentitiesOperation = hasuraOperation(
  PEOPLE_BINDING,
  'mergeIdentities',
  {
    kind: 'mutation',
    document: `mutation MergeIdentities($target: uuid!, $sources: _uuid!, $reason: String) {
  merge_identities(args: { p_target: $target, p_sources: $sources, p_reason: $reason }) {
    id
    target_identity_id
    status
  }
}`,
    variables: (input) => {
      const { targetId, sourceIds, reason } = input as z.infer<typeof mergeIdentitiesInput>;
      const text = reason?.trim() ?? '';
      return {
        target: targetId,
        sources: `{${mergeSources(targetId, sourceIds).join(',')}}`,
        reason: text === '' ? null : text,
      };
    },
    mapResult: firstRow('merge_identities'),
  },
  sqlRefusals({
    merge_sources_required: 'Choose at least one identity to merge into this one.' + NOTHING,
    merge_source_is_target: 'An identity cannot be merged into itself.' + NOTHING,
    identity_not_found: 'One of the identities no longer exists.' + NOTHING,
    identity_already_merged:
      'One of the identities is already merged into another one: merge into that one instead, or roll its merge back first.' +
      NOTHING,
    merge_profile_conflict:
      'The identities are linked to different profiles, and a face is never moved to another person silently. Unlink one of them first, or merge the two profiles if they are the same person.' +
      NOTHING,
    identity_synthetic_mismatch: 'A synthetic test identity cannot be merged with a real one.' + NOTHING,
    profile_processing_restricted: RESTRICTED,
  }),
);

/**
 * Merges the source identities into the target (`merge_identities`, one transaction): their
 * photos, face templates, watch-list entries and manual segment memberships move to the target,
 * they become `merged` (frozen, out of matching) and leave their profile; the target takes over
 * the profile when it had none. Open duplicate pairs touching a source close as merged, pending
 * verification requests of a source are cancelled. Every moved row is recorded, so the merge can
 * be rolled back exactly.
 */
export const mergeIdentities = defineMutation('itap:merge-identities', {
  binding: mergeIdentitiesOperation.binding,
  input: schema(mergeIdentitiesInput),
  output: schema(mergeRow.nullable()),
  effects: MERGE_EFFECTS,
});

export const rollbackMergeInput = z.object({ mergeId: z.string().uuid() });

/** `rollback_merge(hasura_session, p_merge_id)` (org_admin). */
export const rollbackMergeOperation = hasuraOperation(
  PEOPLE_BINDING,
  'rollbackMerge',
  {
    kind: 'mutation',
    document: `mutation RollbackMerge($merge: uuid!) {
  rollback_merge(args: { p_merge_id: $merge }) {
    id
    target_identity_id
    status
  }
}`,
    variables: (input) => ({ merge: (input as z.infer<typeof rollbackMergeInput>).mergeId }),
    mapResult: firstRow('rollback_merge'),
  },
  sqlRefusals({
    merge_not_found: 'The merge no longer exists.' + NOTHING,
    merge_not_completed: 'This merge was already rolled back.' + NOTHING,
    merge_target_merged:
      'The kept identity was merged into another one later: merges are undone newest first, so roll back that later merge first.' +
      NOTHING,
    merge_rows_moved: (count) =>
      `${count} of the photos, templates or watch-list entries this merge moved have left the kept identity since (for example by a split), so the merge cannot be undone exactly.${NOTHING}`,
    profile_processing_restricted: RESTRICTED,
  }),
);

/**
 * Undoes a completed merge (`rollback_merge`): exactly the recorded photos, templates,
 * watch-list entries and segment memberships go back, every merged identity gets back its status
 * and profile link, the target loses the profile it inherited, and the duplicate pairs the merge
 * closed reopen. Merges are undone newest first.
 */
export const rollbackMerge = defineMutation('itap:rollback-merge', {
  binding: rollbackMergeOperation.binding,
  input: schema(rollbackMergeInput),
  output: schema(mergeRow.nullable()),
  effects: MERGE_EFFECTS,
});

export const splitIdentityInput = z.object({
  identityId: z.string().uuid(),
  photoIds: z.array(z.string().uuid()).min(1),
  embeddingIds: z.array(z.string().uuid()),
});

/** The identity a split created. */
export const splitResult = z.object({ id: z.string(), code: z.string() });

/** `split_identity(hasura_session, p_identity, p_embedding_ids, p_photo_ids)` (org_admin). */
export const splitIdentityOperation = hasuraOperation(
  PEOPLE_BINDING,
  'splitIdentity',
  {
    kind: 'mutation',
    document: `mutation SplitIdentity($identity: uuid!, $embeddings: _uuid!, $photos: _uuid!) {
  split_identity(args: { p_identity: $identity, p_embedding_ids: $embeddings, p_photo_ids: $photos }) {
    id
    code
  }
}`,
    variables: (input) => {
      const { identityId, photoIds, embeddingIds } = input as z.infer<typeof splitIdentityInput>;
      return { identity: identityId, embeddings: `{${embeddingIds.join(',')}}`, photos: `{${photoIds.join(',')}}` };
    },
    mapResult: firstRow('split_identity'),
  },
  sqlRefusals({
    identity_not_found: 'The identity no longer exists.' + NOTHING,
    identity_already_merged: 'A merged identity cannot be split: roll back its merge first.' + NOTHING,
    split_rows_required: 'Choose at least one photo to split off.' + NOTHING,
    split_row_not_found:
      'One of the chosen photos no longer belongs to this identity. Close the dialog, reload and choose again.' +
      NOTHING,
    // The biometric guards on photos and templates (`identity_biometrics_insert_guard`, merge freeze).
    identity_merged_frozen: 'The identity was merged into another one meanwhile: roll back its merge first.' + NOTHING,
    profile_processing_restricted:
      'Processing of the linked person is restricted: their photos cannot be moved until the restriction is lifted.' +
      NOTHING,
  }),
);

/**
 * Splits photos off an identity that turned out to hold two people (`split_identity`): a new
 * unverified, unlinked identity (source `split`) takes the chosen photos and their face
 * templates; the original keeps the rest. Not undone by a rollback: merge the two back instead.
 */
export const splitIdentity = defineMutation('itap:split-identity', {
  binding: splitIdentityOperation.binding,
  input: schema(splitIdentityInput),
  output: schema(splitResult.nullable()),
  effects: [{ resource: IDENTITY_RESOURCE }],
});
