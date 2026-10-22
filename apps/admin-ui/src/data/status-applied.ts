import type { FlowUnknownCheck } from '@burojs/core';
import { resourceByName } from './resource-by-name';

/**
 * Check again after a lost answer of a flow that sets a status: reads the record back from
 * `resource`; applied when its `field` holds `value`.
 */
export function fieldApplied(resource: string, field: string, value: unknown): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(resource) as never, { id } as never);
      if (row === null || row === undefined) return 'unknown';
      return (row as Readonly<Record<string, unknown>>)[field] === value ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}
