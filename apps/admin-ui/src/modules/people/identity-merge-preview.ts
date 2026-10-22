import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  IDENTITY_DUPLICATE_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  VERIFICATION_REQUEST_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { PEOPLE_BINDING } from './profile-activity';

const count = z.object({ aggregate: z.object({ count: z.number() }) });

const profileRef = z.object({
  code: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  processing_restricted: z.boolean(),
});

/** One identity as the merge review reads it, with what a merge would move or close. */
const previewRow = z.object({
  id: z.string(),
  code: z.string(),
  status: z.string(),
  is_synthetic: z.boolean(),
  primary_photo_file_id: z.string().nullable(),
  profile_id: z.string().nullable(),
  profile: profileRef.nullable(),
  identity_photos_aggregate: count,
  identity_embeddings_aggregate: count,
  watch_list_entries_aggregate: count,
  verification_requests_aggregate: count,
  identity_duplicate_candidates_by_identity_a_aggregate: count,
  identity_duplicate_candidates_by_identity_b_aggregate: count,
});

/** An identity of a merge, flattened: its profile by code and name, and the counts that move. */
export const mergeIdentity = z.object({
  id: z.string(),
  code: z.string(),
  status: z.string(),
  is_synthetic: z.boolean(),
  primary_photo_file_id: z.string().nullable(),
  profile_id: z.string().nullable(),
  profile: z.string().nullable(),
  profile_restricted: z.boolean(),
  photos: z.number(),
  templates: z.number(),
  watch_list_entries: z.number(),
  pending_verifications: z.number(),
  open_pairs: z.number(),
});

export type MergeIdentity = z.infer<typeof mergeIdentity>;

/** One identity of the answer flattened; unparsable is `null`. */
export function mergeIdentityOf(row: unknown): MergeIdentity | null {
  const r = previewRow.safeParse(row);
  if (!r.success) return null;
  const d = r.data;
  return {
    id: d.id,
    code: d.code,
    status: d.status,
    is_synthetic: d.is_synthetic,
    primary_photo_file_id: d.primary_photo_file_id,
    profile_id: d.profile_id,
    profile: d.profile === null ? null : `${d.profile.first_name} ${d.profile.last_name} (${d.profile.code})`,
    profile_restricted: d.profile?.processing_restricted === true,
    photos: d.identity_photos_aggregate.aggregate.count,
    templates: d.identity_embeddings_aggregate.aggregate.count,
    watch_list_entries: d.watch_list_entries_aggregate.aggregate.count,
    pending_verifications: d.verification_requests_aggregate.aggregate.count,
    open_pairs:
      d.identity_duplicate_candidates_by_identity_a_aggregate.aggregate.count +
      d.identity_duplicate_candidates_by_identity_b_aggregate.aggregate.count,
  };
}

/** The selection of one identity of a merge (`MergeIdentity` before flattening). */
export const MERGE_IDENTITY_FIELDS = `id
  code
  status
  is_synthetic
  primary_photo_file_id
  profile_id
  profile { code first_name last_name processing_restricted }
  identity_photos_aggregate { aggregate { count } }
  identity_embeddings_aggregate { aggregate { count } }
  watch_list_entries_aggregate { aggregate { count } }
  verification_requests_aggregate(where: { status: { _eq: pending } }) { aggregate { count } }
  identity_duplicate_candidates_by_identity_a_aggregate(where: { status: { _eq: open } }) { aggregate { count } }
  identity_duplicate_candidates_by_identity_b_aggregate(where: { status: { _eq: open } }) { aggregate { count } }`;

const previewInput = z.object({ ids: z.array(z.string().uuid()).max(50) });

export const mergePreviewOutput = z.array(mergeIdentity);

export const identityMergePreviewOperation = hasuraOperation(PEOPLE_BINDING, 'identityMergePreview', {
  kind: 'query',
  document: `query IdentityMergePreview($ids: [uuid!]!) {
  identities(where: { id: { _in: $ids } }) {
  ${MERGE_IDENTITY_FIELDS}
  }
}`,
  variables: (input) => ({ ids: (input as z.infer<typeof previewInput>).ids }),
  mapResult: (data) => {
    const rows = rootOf(data, 'identities');
    return (Array.isArray(rows) ? rows : []).map(mergeIdentityOf).filter((row) => row !== null);
  },
});

/**
 * The identities of a planned merge with what it would move (photos, face templates, watch-list
 * entries) and close (open duplicate pairs, pending verification requests), for the review.
 */
export const identityMergePreview = defineQuery('itap:identity-merge-preview', {
  binding: identityMergePreviewOperation.binding,
  input: schema(previewInput),
  output: schema(mergePreviewOutput),
  reads: [
    resourceByName(IDENTITY_RESOURCE),
    resourceByName(PROFILE_RESOURCE),
    resourceByName(VERIFICATION_REQUEST_RESOURCE),
    resourceByName(IDENTITY_DUPLICATE_RESOURCE),
    resourceByName(IDENTITY_MERGE_RESOURCE),
  ],
});
