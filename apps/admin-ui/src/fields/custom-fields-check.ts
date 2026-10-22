/**
 * Custom attribute values (`custom_fields` jsonb) against the organization's
 * definitions (`custom_attribute_definitions`), checked as the database trigger
 * `itap.validate_custom_fields` checks them on every write of the column.
 */
import type { FieldProblem } from './field-issue';

/** The columns of a custom attribute definition the field reads. */
export interface AttributeDefinition {
  readonly key: string;
  readonly label: string;
  /** `string`, `number`, `boolean`, `date` (YYYY-MM-DD) or `enum` (one of `options`). */
  readonly data_type: string;
  readonly options: readonly string[] | null;
  readonly required: boolean;
  readonly is_active: boolean;
  readonly sort_order: number;
}

/** A stored key no active attribute offers: an inactive attribute's value, or one whose attribute is gone. */
export interface KeptKey {
  readonly key: string;
  /** The inactive definition, `null` when no definition has this key any more. */
  readonly definition: AttributeDefinition | null;
}

export const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored object, or an empty one for anything else (the validator names a non-object). */
export const valuesOf = (value: unknown): Readonly<Record<string, unknown>> =>
  isPlainObject(value) ? value : {};

/** `itap.is_valid_date`: a real calendar date in strict `YYYY-MM-DD` form. */
export function isValidDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** The active attributes, in the order forms list them (sort order, then label). */
export function activeDefinitions(
  definitions: readonly AttributeDefinition[],
): AttributeDefinition[] {
  return definitions
    .filter((definition) => definition.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** The stored keys no active attribute offers, in stored order; their values stay as they are. */
export function keptKeys(value: unknown, definitions: readonly AttributeDefinition[]): KeptKey[] {
  const byKey = new Map(definitions.map((definition) => [definition.key, definition]));
  return Object.keys(valuesOf(value))
    .filter((key) => byKey.get(key)?.is_active !== true)
    .map((key) => ({ key, definition: byKey.get(key) ?? null }));
}

/**
 * The stored object with `key` set to `next`, or without `key` for `undefined`; every
 * other key (other attributes, inactive or removed ones) is kept untouched.
 */
export function withAttribute(
  value: unknown,
  key: string,
  next: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...valuesOf(value) };
  if (next === undefined) delete out[key];
  else out[key] = next;
  return out;
}

/** Per data type: the refusal's code and its English text after the label. */
const TYPE_PROBLEMS: Readonly<Record<string, { readonly code: string; readonly text: string }>> = {
  string: { code: 'customFields.notText', text: 'enter text.' },
  number: { code: 'customFields.notNumber', text: 'enter a number.' },
  boolean: { code: 'customFields.notBoolean', text: 'choose yes or no.' },
  date: { code: 'customFields.notDate', text: 'enter a date as YYYY-MM-DD.' },
  enum: { code: 'customFields.notOption', text: 'pick one of the options.' },
};

/** Whether `value` (not null) is a value of `definition`'s data type, as the trigger's `CASE` decides. */
function matchesType(definition: AttributeDefinition, value: unknown): boolean {
  switch (definition.data_type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'date':
      return isValidDate(value);
    case 'enum':
      return typeof value === 'string' && (definition.options ?? []).includes(value);
    default:
      return false;
  }
}

/** The refusal of a value that is not a JSON object (`custom_field_invalid:custom_fields`). */
export const NOT_OBJECT: FieldProblem = {
  code: 'customFields.notObject',
  text: 'Custom fields must be an object of attribute values.',
};

/**
 * `null` when `value` passes `itap.validate_custom_fields` for these definitions, else
 * the first refusal, in the trigger's order: not an object; a key no definition (active
 * or not) has; then each active definition by key: a required one missing or `null`, a
 * value of the wrong type. Keys of inactive definitions are accepted unchecked.
 */
export function validateCustomFields(
  value: unknown,
  definitions: readonly AttributeDefinition[],
): FieldProblem | null {
  if (!isPlainObject(value)) return NOT_OBJECT;
  const known = new Set(definitions.map((definition) => definition.key));
  for (const key of Object.keys(value)) {
    if (!known.has(key)) {
      return {
        code: 'customFields.undefinedKey',
        text: `No custom attribute “${key}” exists any more; remove its value to save.`,
        params: { key },
      };
    }
  }
  const active = definitions
    .filter((definition) => definition.is_active)
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  for (const definition of active) {
    const entry = value[definition.key];
    if (entry === undefined || entry === null) {
      if (definition.required) {
        return {
          code: 'customFields.required',
          text: `${definition.label} is required.`,
          params: { label: definition.label },
        };
      }
      continue;
    }
    if (!matchesType(definition, entry)) {
      const problem = TYPE_PROBLEMS[definition.data_type] ?? TYPE_PROBLEMS.string!;
      return {
        code: problem.code,
        text: `${definition.label}: ${problem.text}`,
        params: { label: definition.label },
      };
    }
  }
  return null;
}

/** Order-insensitive JSON equality of two stored values (the trigger compares `jsonb`). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((entry, index) => sameJson(entry, b[index]))
    );
  }
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameJson(a[key], b[key]))
  );
}
