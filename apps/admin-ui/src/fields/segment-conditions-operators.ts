/**
 * The field catalog of a segment target (`itap.segment_field_catalog`, tracked query
 * `segment_fields`) and what each operator takes. The catalog is the one source the database
 * validates against: the editor offers its fields, their operators and enum values, nothing else.
 */
import { type ConditionLeaf, isPlainObject } from './segment-conditions-tree';

/** One field a condition can test, as the catalog lists it. */
export interface CatalogField {
  readonly field: string;
  /** `text`, `enum`, `integer`, `number`, `boolean`, `date`, `timestamp` or a reference type. */
  readonly type: string;
  readonly operators: readonly string[];
  readonly enumValues: readonly string[] | null;
  readonly label: string;
}

/** The catalog of one target by field name, in catalog order. */
export type Catalog = ReadonlyMap<string, CatalogField>;

/** Types whose values are ids of the organization's records. */
export const REFERENCE_TYPES = ['company', 'work_schedule', 'area', 'segment'] as const;

export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export const isReferenceType = (type: string): type is ReferenceType =>
  (REFERENCE_TYPES as readonly string[]).includes(type);

/** Types that take an absolute value or `{"relative_days": n}`. */
export const isDateType = (type: string): boolean => type === 'date' || type === 'timestamp';

/** The most values of an `in` / `nin` list. */
export const MAX_LIST_VALUES = 500;

/** The furthest a relative date reaches, in days either way. */
export const MAX_RELATIVE_DAYS = 36500;

/** What an operator's value is: one value, a list, a [low, high] pair, or true/false (`is_null`). */
export type ValueShape = 'scalar' | 'list' | 'pair' | 'flag';

export function shapeOf(operator: string): ValueShape {
  if (operator === 'is_null') return 'flag';
  if (operator === 'in' || operator === 'nin') return 'list';
  if (operator === 'between') return 'pair';
  return 'scalar';
}

/** `{"relative_days": n}` (any n; the validator checks it). */
export const isRelative = (value: unknown): value is { readonly relative_days: unknown } =>
  isPlainObject(value) && 'relative_days' in value;

/** A fresh value of a type: the first enum value, yes for a flag, else empty (to be filled in). */
export function defaultScalar(spec: CatalogField): unknown {
  if (spec.type === 'enum') return spec.enumValues?.[0] ?? '';
  if (spec.type === 'boolean') return true;
  if (spec.type === 'text') return '';
  return null;
}

/** A fresh value for `operator` on `spec`. */
export function defaultValue(spec: CatalogField, operator: string): unknown {
  const shape = shapeOf(operator);
  if (shape === 'flag') return true;
  if (shape === 'list') return [];
  if (shape === 'pair') return [null, null];
  return defaultScalar(spec);
}

/** The value kept across an operator change: one value moves into or out of a list or a pair. */
export function convertValue(spec: CatalogField, value: unknown, from: string, to: string): unknown {
  const was = shapeOf(from);
  const next = shapeOf(to);
  if (was === next) return value;
  const first = Array.isArray(value) ? value[0] : value;
  const filled = first !== undefined && first !== null && first !== '' && was !== 'flag';
  if (next === 'list') return filled ? [first] : [];
  if (next === 'pair') return [filled ? first : null, null];
  if (next === 'scalar') return filled ? first : defaultScalar(spec);
  return true;
}

/** The leaf with another field: its operator kept when the field offers it, the value kept when the type is the same. */
export function withField(leaf: ConditionLeaf, previous: CatalogField | undefined, spec: CatalogField): ConditionLeaf {
  const operator = typeof leaf.operator === 'string' && spec.operators.includes(leaf.operator) ? leaf.operator : (spec.operators[0] ?? 'eq');
  const sameType = previous !== undefined && previous.type === spec.type && previous.type !== 'enum' && operator === leaf.operator;
  return { field: spec.field, operator, value: sameType ? leaf.value : defaultValue(spec, operator) };
}

/** The leaf with another operator, the value carried over where it fits. */
export function withOperator(leaf: ConditionLeaf, spec: CatalogField | undefined, operator: string): ConditionLeaf {
  const from = typeof leaf.operator === 'string' ? leaf.operator : 'eq';
  const value = spec === undefined ? leaf.value : convertValue(spec, leaf.value, from, operator);
  return { field: leaf.field, operator, value };
}

/** A new condition: the catalog's first field with its first operator. */
export function newLeaf(catalog: Catalog): ConditionLeaf {
  const [spec] = catalog.values();
  if (spec === undefined) return { field: '', operator: 'eq', value: null };
  const operator = spec.operators[0] ?? 'eq';
  return { field: spec.field, operator, value: defaultValue(spec, operator) };
}

/** The catalog rows (`segment_fields`) as a map by field name. */
export function catalogOf(rows: readonly CatalogField[]): Catalog {
  return new Map(rows.map((row) => [row.field, row]));
}
