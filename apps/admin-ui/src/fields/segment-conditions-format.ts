/**
 * Segment conditions as one readable sentence: `Profile type is contractor and Status is active and
 * End date is between today and in 30 days`. Nested groups are put in parentheses, "not" reads
 * `not (…)`, records by name, relative dates in words. A field the catalog no longer offers and a
 * node that is not a condition stay visible (named as such), never dropped.
 */
import { type Catalog, isDateType, isReferenceType, isRelative } from './segment-conditions-operators';
import { type ConditionRefs, referenceName } from './segment-conditions-refs';
import { childrenOf, isEmptyConditions, isGroup, isLeaf } from './segment-conditions-tree';

export type Translate = (key: string, options?: { readonly params?: Record<string, unknown> }) => string;

export interface FormatContext {
  readonly catalog?: Catalog;
  readonly refs?: ConditionRefs;
  readonly t: Translate;
}

const K = 'console.segmentConditions';

/** `checked_in` → `checked in`. */
export const humanize = (value: string): string => value.replace(/_/gu, ' ');

/** A timestamp in the viewer's locale and zone, or the text as stored. */
function moment(value: string): string {
  const at = Date.parse(value);
  return Number.isNaN(at) ? value : new Date(at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeText(days: unknown, type: string, t: Translate): string {
  if (typeof days !== 'number') return JSON.stringify(days);
  if (days === 0) return t(`${K}.rel.${type === 'timestamp' ? 'now' : 'today'}`);
  const size = Math.abs(days);
  const key = days > 0 ? (size === 1 ? 'aheadOne' : 'ahead') : size === 1 ? 'agoOne' : 'ago';
  return t(`${K}.rel.${key}`, { params: { days: size } });
}

/** One value of a field as people read it. */
export function valueText(type: string | undefined, value: unknown, ctx: FormatContext): string {
  const { t } = ctx;
  if (value === null || value === undefined || value === '') return t(`${K}.say.blank`);
  if (type !== undefined && isDateType(type) && isRelative(value)) return relativeText(value.relative_days, type, t);
  if (typeof value === 'boolean') return t(`${K}.${value ? 'yes' : 'no'}`);
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value !== 'string') return JSON.stringify(value);
  if (type !== undefined && isReferenceType(type)) {
    const name = ctx.refs === undefined ? undefined : referenceName(type, value, ctx.refs);
    return name ?? t(`${K}.unknownRecord`, { params: { id: value } });
  }
  if (type === 'enum') return humanize(value);
  if (type === 'timestamp') return moment(value);
  if (type === 'date') return value;
  return `“${value}”`;
}

const DATE_WORDS: Readonly<Record<string, string>> = { gt: 'after', gte: 'onOrAfter', lt: 'before', lte: 'onOrBefore' };

function leafText(leaf: { readonly field: unknown; readonly operator: unknown; readonly value: unknown }, ctx: FormatContext): string {
  const { t } = ctx;
  const name = String(leaf.field);
  const spec = ctx.catalog?.get(name);
  const field =
    spec?.label ?? (ctx.catalog === undefined ? humanize(name) : t(`${K}.unknownFieldName`, { params: { field: name } }));
  const operator = String(leaf.operator);
  const type = spec?.type;
  const one = (value: unknown) => valueText(type, value, ctx);
  const values = (list: unknown) => (Array.isArray(list) ? list.map(one).join(', ') : one(list));
  if (operator === 'is_null') return t(`${K}.say.${leaf.value === false ? 'notNull' : 'isNull'}`, { params: { field } });
  if (operator === 'between') {
    const [low, high] = Array.isArray(leaf.value) ? leaf.value : [leaf.value, undefined];
    return t(`${K}.say.between`, { params: { field, low: one(low), high: one(high) } });
  }
  if (type === 'boolean' && operator === 'eq') return t(`${K}.say.flag`, { params: { field, value: one(leaf.value) } });
  const word = type !== undefined && isDateType(type) ? (DATE_WORDS[operator] ?? operator) : operator;
  const known = ['eq', 'neq', 'in', 'nin', 'contains', 'gt', 'gte', 'lt', 'lte', ...Object.values(DATE_WORDS)].includes(word);
  return known
    ? t(`${K}.say.${word}`, { params: { field, value: values(leaf.value) } })
    : t(`${K}.say.other`, { params: { field, operator, value: values(leaf.value) } });
}

function nodeText(node: unknown, ctx: FormatContext, nested: boolean): string {
  const { t } = ctx;
  if (isLeaf(node)) return leafText(node, ctx);
  if (!isGroup(node)) return t(`${K}.unreadable`);
  const children = childrenOf(node);
  if (node.op === 'not') {
    const [only] = children;
    const inner = children.length === 1 ? nodeText(only, ctx, false) : children.map((child) => nodeText(child, ctx, true)).join(t(`${K}.joinAnd`));
    return t(`${K}.say.not`, { params: { condition: inner } });
  }
  if (children.length === 0) return t(`${K}.emptyGroup`);
  if (children.length === 1) return nodeText(children[0], ctx, nested);
  const joined = children.map((child) => nodeText(child, ctx, true)).join(t(`${K}.${node.op === 'or' ? 'joinOr' : 'joinAnd'}`));
  return nested ? `(${joined})` : joined;
}

/** The conditions as one sentence; `{}` reads "no conditions". */
export function conditionsSentence(value: unknown, ctx: FormatContext): string {
  if (isEmptyConditions(value)) return ctx.t(`${K}.none`);
  return nodeText(value, ctx, false);
}
