import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  IDENTITY_DUPLICATE_RESOURCE,
  IDENTITY_MERGE_RESOURCE,
  IDENTITY_MERGE_SOURCE_RESOURCE,
  IDENTITY_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MERGE_IDENTITY_FIELDS, mergeIdentity, mergeIdentityOf } from './identity-merge-preview';
import { PEOPLE_BINDING } from './profile-activity';

const personName = z
  .object({ code: z.string(), first_name: z.string(), last_name: z.string() })
  .nullable()
  .transform((p) => (p === null ? null : `${p.first_name} ${p.last_name} (${p.code})`));

const rollbackRow = z.object({
  id: z.string(),
  status: z.string(),
  inherited_primary: z.boolean(),
  inherited_profile: personName,
  target_identity: z.unknown(),
  identity_merge_sources: z.array(
    z.object({
      previous_status: z.string(),
      previous_is_primary: z.boolean(),
      previous_profile: personName,
      source_identity: z.unknown(),
    }),
  ),
  identity_duplicate_candidates_aggregate: z.object({ aggregate: z.object({ count: z.number() }) }),
});

/** A merged identity and what a rollback gives it back. */
export const rollbackSource = z.object({
  identity: mergeIdentity,
  previous_status: z.string(),
  previous_profile: z.string().nullable(),
  previous_is_primary: z.boolean(),
});

/** A merge as its rollback review reads it. */
export const mergeRollback = z.object({
  id: z.string(),
  status: z.string(),
  target: mergeIdentity,
  inherited_profile: z.string().nullable(),
  inherited_primary: z.boolean(),
  sources: z.array(rollbackSource),
  closed_pairs: z.number(),
});

export type MergeRollback = z.infer<typeof mergeRollback>;

/** The merge of the answer, flattened; missing or unparsable is `null`. */
export function mergeRollbackOf(data: unknown): MergeRollback | null {
  const rows = rootOf(data, 'identity_merges');
  const r = rollbackRow.safeParse(Array.isArray(rows) ? rows[0] : undefined);
  if (!r.success) return null;
  const target = mergeIdentityOf(r.data.target_identity);
  if (target === null) return null;
  const sources = r.data.identity_merge_sources.flatMap((source) => {
    const identity = mergeIdentityOf(source.source_identity);
    return identity === null
      ? []
      : [
          {
            identity,
            previous_status: source.previous_status,
            previous_profile: source.previous_profile,
            previous_is_primary: source.previous_is_primary,
          },
        ];
  });
  return {
    id: r.data.id,
    status: r.data.status,
    target,
    inherited_profile: r.data.inherited_profile,
    inherited_primary: r.data.inherited_primary,
    sources,
    closed_pairs: r.data.identity_duplicate_candidates_aggregate.aggregate.count,
  };
}

const rollbackInput = z.object({ mergeId: z.string().uuid() });

export const mergeRollbackPreviewOperation = hasuraOperation(PEOPLE_BINDING, 'mergeRollbackPreview', {
  kind: 'query',
  document: `query MergeRollbackPreview($merge: uuid!) {
  identity_merges(where: { id: { _eq: $merge } }, limit: 1) {
    id
    status
    inherited_primary
    inherited_profile { code first_name last_name }
    target_identity {
  ${MERGE_IDENTITY_FIELDS}
    }
    identity_merge_sources(order_by: { created_at: asc }) {
      previous_status
      previous_is_primary
      previous_profile { code first_name last_name }
      source_identity {
  ${MERGE_IDENTITY_FIELDS}
      }
    }
    identity_duplicate_candidates_aggregate { aggregate { count } }
  }
}`,
  variables: (input) => ({ merge: (input as z.infer<typeof rollbackInput>).mergeId }),
  mapResult: mergeRollbackOf,
});

/**
 * A merge with its kept identity, each merged identity and what it gets back on a rollback
 * (status, profile link), and the duplicate pairs the merge closed, for the rollback review.
 */
export const mergeRollbackPreview = defineQuery('itap:merge-rollback-preview', {
  binding: mergeRollbackPreviewOperation.binding,
  input: schema(rollbackInput),
  output: schema(mergeRollback.nullable()),
  reads: [
    resourceByName(IDENTITY_MERGE_RESOURCE),
    resourceByName(IDENTITY_MERGE_SOURCE_RESOURCE),
    resourceByName(IDENTITY_RESOURCE),
    resourceByName(IDENTITY_DUPLICATE_RESOURCE),
  ],
});
