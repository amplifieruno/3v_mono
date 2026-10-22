import type { AttributeDefinition } from './custom-fields-check';

/**
 * What a mounted `customFields` input knows that its validator cannot read: the
 * definitions it loaded for its entity and, on an edit, the value the record holds.
 * buro hands a field validator only the value and the form values, never data the
 * input read (`tasks/ui/buro-gaps.md` G17); the input publishes here while it is
 * mounted and the validator reads it on save.
 */
export interface CustomFieldsSnapshot {
  readonly definitions: readonly AttributeDefinition[];
  /** The stored value of the record being edited; absent on a create. */
  readonly stored?: unknown;
}

const snapshots = new Map<string, CustomFieldsSnapshot>();

/** Publishes `snapshot` for `entity`; the returned function withdraws it (if still the current one). */
export function publishCustomFields(entity: string, snapshot: CustomFieldsSnapshot): () => void {
  snapshots.set(entity, snapshot);
  return () => {
    if (snapshots.get(entity) === snapshot) snapshots.delete(entity);
  };
}

/** The snapshot a mounted input published for `entity`, if any. */
export function customFieldsSnapshot(entity: string): CustomFieldsSnapshot | undefined {
  return snapshots.get(entity);
}
