import type { CatalogField, EvaluationContext, SegmentTarget, Where } from './types.js';

/** Shared leaf helpers of the translator (translate.ts, translateFields.ts). */

export type Leaf = { field: string; operator: string; value: unknown };
export type LeafEnv = { target: SegmentTarget; spec: CatalogField; ctx: EvaluationContext; path: string };

export const isNullable = (spec: CatalogField): boolean => spec.operators.includes('is_null');

const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Hasura comparison operators for one leaf on a plain value (not is_null). */
export function comparison(operator: string, values: unknown[]): Where {
  switch (operator) {
    case 'in':
      return { _in: values };
    case 'nin':
      return { _nin: values };
    case 'between':
      return { _gte: values[0], _lte: values[1] };
    case 'contains':
      return { _ilike: `%${escapeLike(String(values[0]))}%` };
    default:
      return { [`_${operator}`]: values[0] };
  }
}

/** A plain column (or scalar computed field) of the target table. */
export function columnLeaf(column: string, leaf: Leaf, values: unknown[], nullable: boolean): Where {
  if (leaf.operator === 'is_null') return { [column]: { _is_null: values[0] } };
  const cmp = comparison(leaf.operator, values);
  return { [column]: nullable ? { _is_null: false, ...cmp } : cmp };
}
