import type { RelationTarget } from '@burojs/core';

/**
 * A resource handle by its registered name, for a source or a related list whose target
 * would otherwise be imported in a cycle (a resource placing a block that reads it, or a
 * list of its own kind). buro reads only `kind` and `ref` of a handle (`handleRef`,
 * `targetRef`); the rows read through it are untyped.
 */
export function resourceByName(name: string): RelationTarget {
  return { kind: 'resource', ref: name } as unknown as RelationTarget;
}
