import type { ConditionContext } from './segment-conditions-validate';

/**
 * What a mounted conditions editor read that its validator cannot: the catalog and records of
 * its target and the segment being edited. buro hands a field validator only the value and the
 * form values (`tasks/ui/buro-gaps.md` G17, G50); the editor publishes here while it is mounted and
 * the validator reads it on save, so a save is checked against the catalog the server checks.
 */
export interface ConditionsSnapshot extends ConditionContext {
  readonly target: string;
}

const snapshots = new Map<string, ConditionsSnapshot>();

/** Publishes `snapshot` under its target; the returned function withdraws it (if still current). */
export function publishConditions(snapshot: ConditionsSnapshot): () => void {
  snapshots.set(snapshot.target, snapshot);
  return () => {
    if (snapshots.get(snapshot.target) === snapshot) snapshots.delete(snapshot.target);
  };
}

/**
 * The snapshot of `target`; without a target (a form that does not carry it), the only one
 * published, if exactly one is.
 */
export function conditionsSnapshot(target: string | undefined): ConditionsSnapshot | undefined {
  if (target !== undefined) return snapshots.get(target);
  return snapshots.size === 1 ? [...snapshots.values()][0] : undefined;
}
