/**
 * The client half of `itap.validate_segment_conditions` (migrations `…082`, `…089`): the same
 * grammar, limits, value checks and references, each problem on the JSON path the database would
 * name (`segment_condition_invalid:<path>`). Unlike the database, which stops at the first
 * problem, every node's first problem is reported, so the editor can mark them all. Without the
 * catalog only the grammar is checked; without the records, no reference.
 */
import { isValidDate } from './custom-fields-check';
import type { FieldProblem } from './field-issue';
import {
  type Catalog,
  type CatalogField,
  MAX_LIST_VALUES,
  MAX_RELATIVE_DAYS,
  isDateType,
  isReferenceType,
  isRelative,
} from './segment-conditions-operators';
import { jsonPathOf } from './segment-conditions-path';
import { type ConditionRefs, UUID, rowsOf, sameId } from './segment-conditions-refs';
import { GROUP_OPS, MAX_CHILDREN, MAX_DEPTH, type NodePath, isGroup, isPlainObject } from './segment-conditions-tree';

/** A problem of the conditions on the JSON path the database would name. */
export interface ConditionProblem extends FieldProblem {
  readonly path: string;
}

export interface ConditionContext {
  readonly catalog?: Catalog;
  readonly refs?: ConditionRefs;
  /** The segment's target (`profiles` / `identities`): the segments a condition may name. */
  readonly target?: string;
  /** The segment being edited: it may not name itself. */
  readonly self?: string;
}

const TEXTS = {
  notNode: 'This is not a condition or a group: remove it.',
  groupKeys: 'A group holds only its operator and its conditions: remove it and add it again.',
  groupOp: 'Choose all, any or not for the group.',
  noChildren: 'Add at least one condition to the group, or remove the group.',
  tooManyChildren: 'A group holds at most 100 conditions: move some into a group of their own.',
  notOne: '“Not” takes exactly one condition: put the others in a group under it.',
  tooDeep: 'Groups nest at most 7 levels deep: move this condition up.',
  leafKeys: 'A condition holds only a field, an operator and a value: remove it and add it again.',
  unknownField:
    'The field “{{field}}” is not offered for these members any more (a custom field switched off, or another target): choose another field or remove the condition.',
  badOperator: '“{{operator}}” does not apply to this field: choose another operator.',
  flag: 'Choose empty or not empty.',
  listEmpty: 'Add at least one value.',
  listTooLong: 'Enter at most 500 values.',
  pair: 'Enter both ends of the range.',
  reversed: 'The range starts after it ends: swap the two values.',
  text: 'Enter some text.',
  enum: 'Choose one of the listed values.',
  integer: 'Enter a whole number from -2147483648 to 2147483647.',
  number: 'Enter a number (less than 10^15 either way).',
  boolean: 'Choose yes or no.',
  date: 'Enter a date, or a whole number of days from the evaluation day (-36500 to 36500).',
  timestamp: 'Enter a date and time, or a whole number of days from the evaluation time (-36500 to 36500).',
  reference: 'Choose a record from the list.',
  gone: 'The record named here no longer exists in the organization: choose another.',
  segmentNotManual: 'Only a manual segment of the same members can be named here: choose another.',
  segmentSelf: 'A segment cannot name itself: choose another.',
} as const;

export type ConditionProblemCode = keyof typeof TEXTS;

export const CONDITION_PROBLEM_TEXTS: Readonly<Record<ConditionProblemCode, string>> = TEXTS;

function problem(code: ConditionProblemCode, path: string, params?: Readonly<Record<string, string>>): ConditionProblem {
  let text: string = TEXTS[code];
  for (const [key, value] of Object.entries(params ?? {})) text = text.replace(`{{${key}}}`, value);
  return { code: `segmentConditions.${code}`, text, path, ...(params === undefined ? {} : { params }) };
}

const keysAre = (node: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean => {
  const own = Object.keys(node).sort();
  return own.length === keys.length && own.every((key, i) => key === keys[i]);
};

/** `segment_value_valid`: whether one value fits the type (relative days for dates). */
export function valueFits(type: string, value: unknown, enumValues: readonly string[] | null): boolean {
  if (isDateType(type) && isPlainObject(value)) {
    const days = value.relative_days;
    return keysAre(value, ['relative_days']) && typeof days === 'number' && Number.isInteger(days) && Math.abs(days) <= MAX_RELATIVE_DAYS;
  }
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e15;
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
  if (typeof value !== 'string') return false;
  if (type === 'text') return value.trim() !== '';
  if (type === 'enum') return (enumValues ?? []).includes(value);
  if (type === 'date') return isValidDate(value);
  if (type === 'timestamp') return /^\d{4}-\d{2}-\d{2}/u.test(value) && !Number.isNaN(Date.parse(value));
  return UUID.test(value);
}

/** `segment_value_key`: a comparable key of a valid bound, `null` for a relative one. */
function boundKey(type: string, value: unknown): number | null {
  if (isRelative(value)) return null;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  return type === 'date' ? Date.parse(`${value}T00:00:00Z`) : Date.parse(value);
}

const VALUE_CODE: Readonly<Record<string, ConditionProblemCode>> = {
  text: 'text',
  enum: 'enum',
  integer: 'integer',
  number: 'number',
  boolean: 'boolean',
  date: 'date',
  timestamp: 'timestamp',
};

/** The first problem of one value (type, then reference), or `null`. */
function scalarProblem(spec: CatalogField, value: unknown, path: string, ctx: ConditionContext): ConditionProblem | null {
  if (!valueFits(spec.type, value, spec.enumValues)) return problem(VALUE_CODE[spec.type] ?? 'reference', path);
  if (!isReferenceType(spec.type) || ctx.refs === undefined || typeof value !== 'string') return null;
  const row = rowsOf(spec.type, ctx.refs).find((candidate) => sameId(candidate.id, value));
  if (row === undefined) return problem('gone', path);
  if (spec.type !== 'segment') return null;
  const segment = ctx.refs.segments.find((candidate) => sameId(candidate.id, value));
  if (ctx.self !== undefined && sameId(value, ctx.self)) return problem('segmentSelf', path);
  if (segment?.kind !== 'manual' || (ctx.target !== undefined && segment.target !== ctx.target)) return problem('segmentNotManual', path);
  return null;
}

/** The value's problem for `operator` (the shape first, then each value), or `null`. */
function valueProblem(spec: CatalogField | undefined, operator: string, value: unknown, path: string, ctx: ConditionContext): ConditionProblem | null {
  const at = `${path}.value`;
  if (operator === 'is_null') return typeof value === 'boolean' ? null : problem('flag', at);
  if (operator === 'in' || operator === 'nin') {
    if (!Array.isArray(value) || value.length === 0) return problem('listEmpty', at);
    if (value.length > MAX_LIST_VALUES) return problem('listTooLong', at);
    if (spec === undefined) return null;
    for (const [index, item] of value.entries()) {
      const found = scalarProblem(spec, item, `${at}[${index}]`, ctx);
      if (found !== null) return found;
    }
    return null;
  }
  if (operator === 'between') {
    if (!Array.isArray(value) || value.length !== 2) return problem('pair', at);
    if (spec === undefined) return null;
    const [low, high] = value as [unknown, unknown];
    if (!valueFits(spec.type, low, spec.enumValues) || !valueFits(spec.type, high, spec.enumValues)) {
      return low === null || high === null ? problem('pair', at) : problem(VALUE_CODE[spec.type] ?? 'reference', at);
    }
    if (isRelative(low) && isRelative(high)) {
      return (low.relative_days as number) > (high.relative_days as number) ? problem('reversed', at) : null;
    }
    const [from, to] = [boundKey(spec.type, low), boundKey(spec.type, high)];
    return from !== null && to !== null && from > to ? problem('reversed', at) : null;
  }
  return spec === undefined ? null : scalarProblem(spec, value, at, ctx);
}

function leafProblems(node: Readonly<Record<string, unknown>>, path: string, ctx: ConditionContext): ConditionProblem[] {
  if (!keysAre(node, ['field', 'operator', 'value'])) return [problem('leafKeys', path)];
  const field = typeof node.field === 'string' ? node.field : '';
  const spec = ctx.catalog?.get(field);
  if (ctx.catalog !== undefined && spec === undefined) return [problem('unknownField', `${path}.field`, { field })];
  const operator = typeof node.operator === 'string' ? node.operator : '';
  if (spec !== undefined && !spec.operators.includes(operator)) {
    return [problem('badOperator', `${path}.operator`, { operator })];
  }
  const found = valueProblem(spec, operator, node.value, path, ctx);
  return found === null ? [] : [found];
}

function nodeProblems(node: unknown, at: NodePath, ctx: ConditionContext): ConditionProblem[] {
  const path = jsonPathOf(at);
  if (!isPlainObject(node) || at.length + 1 > MAX_DEPTH) return [problem(isPlainObject(node) ? 'tooDeep' : 'notNode', path)];
  if (!isGroup(node)) return leafProblems(node, path, ctx);
  if (!keysAre(node, ['children', 'op'])) return [problem('groupKeys', path)];
  if (typeof node.op !== 'string' || !(GROUP_OPS as readonly string[]).includes(node.op)) return [problem('groupOp', `${path}.op`)];
  const children = node.children;
  if (!Array.isArray(children) || children.length === 0) return [problem('noChildren', `${path}.children`)];
  const own =
    children.length > MAX_CHILDREN
      ? [problem('tooManyChildren', `${path}.children`)]
      : node.op === 'not' && children.length !== 1
        ? [problem('notOne', `${path}.children`)]
        : [];
  return [...own, ...children.flatMap((child, index) => nodeProblems(child, [...at, index], ctx))];
}

/**
 * Every node's first problem, in tree order; none for `{}` / nothing stored (whether a segment
 * needs conditions is the form's check: a manual segment keeps `{}`).
 */
export function validateSegmentConditions(value: unknown, ctx: ConditionContext = {}): ConditionProblem[] {
  if (value === null || value === undefined || (isPlainObject(value) && Object.keys(value).length === 0)) return [];
  return nodeProblems(value, [], ctx);
}
