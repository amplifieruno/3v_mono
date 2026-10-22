import type { MergeIdentity } from './identity-merge-preview';

/** Which identities a merge review shows: the kept one and the merged ones, or a bare pair. */
export interface MergeSides {
  /** The kept identity, or `null` when only comparing (a pair without a chosen side). */
  readonly targetId: string | null;
  /** The identities merged into the kept one (or, comparing, both of the pair). */
  readonly sourceIds: readonly string[];
}

/** The sides a review's props describe: a duplicate pair with the kept side, or a target and sources. */
export function mergeSides(props: {
  readonly first?: string | null;
  readonly second?: string | null;
  readonly keep?: string | null;
  readonly targetId?: string | null;
  readonly sourceIds?: readonly string[] | null;
}): MergeSides {
  const { first, second, keep } = props;
  if (typeof first === 'string' && typeof second === 'string') {
    if (keep !== 'first' && keep !== 'second') return { targetId: null, sourceIds: [first, second] };
    return keep === 'second' ? { targetId: second, sourceIds: [first] } : { targetId: first, sourceIds: [second] };
  }
  const target = typeof props.targetId === 'string' ? props.targetId : null;
  const sources = [...new Set(props.sourceIds ?? [])].filter((id) => id !== target);
  return { targetId: target, sourceIds: sources };
}

/** Why the database would refuse the merge, said before it is sent. */
export type MergeProblem =
  | { readonly kind: 'merged'; readonly code: string }
  | { readonly kind: 'profiles' }
  | { readonly kind: 'synthetic' }
  | { readonly kind: 'restricted'; readonly code: string };

/** What a merge of `sources` into `target` does, totalled over the merged identities. */
export interface MergeEffect {
  readonly photos: number;
  readonly templates: number;
  readonly watchListEntries: number;
  readonly openPairs: number;
  readonly pendingVerifications: number;
  /** The profile the kept identity takes over (it had none and a merged one had one). */
  readonly inheritedProfile: string | null;
}

/** The refusals of `merge_identities` that the rows already show, in the order it checks them. */
export function mergeProblems(target: MergeIdentity, sources: readonly MergeIdentity[]): MergeProblem[] {
  const all = [target, ...sources];
  const problems: MergeProblem[] = [];
  for (const row of all) if (row.status === 'merged') problems.push({ kind: 'merged', code: row.code });
  const profiles = new Set(all.flatMap((row) => (row.profile_id === null ? [] : [row.profile_id])));
  if (profiles.size > 1) problems.push({ kind: 'profiles' });
  if (sources.some((row) => row.is_synthetic !== target.is_synthetic)) problems.push({ kind: 'synthetic' });
  for (const row of sources) if (row.profile_restricted) problems.push({ kind: 'restricted', code: row.code });
  return problems;
}

/** What moves to the kept identity and what closes, from the merged identities' counts. */
export function mergeEffect(target: MergeIdentity, sources: readonly MergeIdentity[]): MergeEffect {
  const sum = (pick: (row: MergeIdentity) => number) => sources.reduce((total, row) => total + pick(row), 0);
  return {
    photos: sum((row) => row.photos),
    templates: sum((row) => row.templates),
    watchListEntries: sum((row) => row.watch_list_entries),
    openPairs: sum((row) => row.open_pairs),
    pendingVerifications: sum((row) => row.pending_verifications),
    inheritedProfile: target.profile_id === null ? (sources.find((row) => row.profile !== null)?.profile ?? null) : null,
  };
}
