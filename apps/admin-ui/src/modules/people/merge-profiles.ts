import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import {
  CONSENT_RECORD_RESOURCE,
  PROFILE_DOCUMENT_RESOURCE,
  PROFILE_DUPLICATE_RESOURCE,
  PROFILE_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import type { MERGE_KEEP } from '../../enums/people-records';
import { PEOPLE_BINDING } from './profile-activity';

export const mergeProfilesInput = z.object({ targetId: z.string().uuid(), sourceId: z.string().uuid() });

/** The kept profile as the function returns it. */
export const mergeProfilesOutput = z.object({ id: z.string() });

/** `merge_profiles(hasura_session, p_target, p_source)` (org_admin); Hasura fills the session. */
export const mergeProfilesOperation = hasuraOperation(PEOPLE_BINDING, 'mergeProfiles', {
  kind: 'mutation',
  document: `mutation MergeProfiles($target: uuid!, $source: uuid!) {
  merge_profiles(args: { p_target: $target, p_source: $source }) {
    id
  }
}`,
  variables: (input) => {
    const { targetId, sourceId } = input as z.infer<typeof mergeProfilesInput>;
    return { target: targetId, source: sourceId };
  },
  mapResult: (data) => {
    const rows = rootOf(data, 'merge_profiles');
    return Array.isArray(rows) ? (rows[0] ?? null) : null;
  },
});

/**
 * Folds the source profile into the target (the SQL function `merge_profiles`): the source's
 * identities, documents and consents move to the target, its watch-list entries fold into the
 * target's, its open duplicate pairs close as merged and it becomes inactive. The target's
 * latest biometric consent then decides face matching for all moved identities. There is no
 * undo. The database refuses an erased source, and moving identities of a restricted person.
 */
export const mergeProfiles = defineMutation('itap:merge-profiles', {
  binding: mergeProfilesOperation.binding,
  input: schema(mergeProfilesInput),
  output: schema(mergeProfilesOutput.nullable()),
  effects: [
    { resource: PROFILE_RESOURCE },
    { resource: PROFILE_DOCUMENT_RESOURCE },
    { resource: CONSENT_RECORD_RESOURCE },
    { resource: PROFILE_DUPLICATE_RESOURCE },
  ],
});

/** A duplicate pair's ids as the merge reads them. */
interface Pair {
  readonly profile_a_id?: unknown;
  readonly profile_b_id?: unknown;
}

/** The merge's target and source for the chosen side: the kept profile is the target. */
export function mergeDirection(
  pair: Pair | undefined,
  keep: unknown,
): z.input<typeof mergeProfilesInput> {
  const first = String(pair?.profile_a_id ?? '');
  const second = String(pair?.profile_b_id ?? '');
  const keepSecond = keep === ('second' satisfies (typeof MERGE_KEEP)[number]);
  return keepSecond ? { targetId: second, sourceId: first } : { targetId: first, sourceId: second };
}

/** Why the pair cannot be merged, read from both profiles: `null` when it can. */
export async function mergeBlocker(
  pair: Pair | undefined,
  one: (id: string) => Promise<unknown>,
): Promise<'erased' | 'restricted' | null> {
  const ids = [pair?.profile_a_id, pair?.profile_b_id].filter((id): id is string => typeof id === 'string');
  const rows = (await Promise.all(ids.map(one))) as ({
    readonly erased_at?: unknown;
    readonly processing_restricted?: unknown;
  } | null)[];
  if (rows.some((row) => typeof row?.erased_at === 'string')) return 'erased';
  if (rows.some((row) => row?.processing_restricted === true)) return 'restricted';
  return null;
}
