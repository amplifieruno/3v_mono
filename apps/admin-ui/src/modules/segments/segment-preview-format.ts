import { SEGMENT_TARGETS } from '../../enums/segments';
import { isEmptyConditions, isPlainObject } from '../../fields/segment-conditions-tree';
import { type PreviewInput, refusedCondition } from './segment-evaluation-ops';

/**
 * What a preview sends for the form's current target and conditions, or `null` while there is
 * nothing to preview (no target yet, or no condition).
 */
export function previewSnapshot(target: unknown, conditions: unknown): PreviewInput | null {
  if (!(SEGMENT_TARGETS as readonly unknown[]).includes(target)) return null;
  if (!isPlainObject(conditions) || isEmptyConditions(conditions)) return null;
  return { target: target as PreviewInput['target'], conditions: { ...conditions } };
}

/** Whether two previews ask the same (the form's conditions are plain JSON). */
export function sameSnapshot(a: PreviewInput | null, b: PreviewInput | null): boolean {
  if (a === null || b === null) return a === b;
  return a.target === b.target && JSON.stringify(a.conditions) === JSON.stringify(b.conditions);
}

/**
 * The condition a refused preview names (`segment_condition_invalid:<path>` in the action's
 * error), read in the conditions it sent; `null` for any other failure.
 */
export function previewRefusal(error: unknown, conditions: unknown): string | null {
  return refusedCondition(JSON.stringify(error ?? null), conditions);
}

/** How many matches the sample does not name. */
export function unnamedMatches(count: number, named: number): number {
  return Math.max(0, count - named);
}
