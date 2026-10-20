import { columnLeaf, isNullable, type Leaf, type LeafEnv } from './compare.js';
import { translateDerived } from './translateFields.js';
import { SegmentTranslateError, type CatalogField, type EvaluationContext, type SegmentTarget, type Where } from './types.js';

/**
 * The one evaluator of the segment condition language (spec §8.0): a condition tree -> a Hasura `where` for
 * `profiles` / `identities`, run with an org-scoped session so permissions apply. Pure: the field catalog and the
 * time-dependent inputs (EvaluationContext) are fetched by the caller.
 *
 * Semantics: two-valued. A comparison on a null value (null column, missing jsonb key, no activity stats row) is
 * false; `not` negates its child's result, so `not (email eq x)` matches profiles without an email.
 */

const DAY_MS = 86_400_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const hasExactKeys = (v: Record<string, unknown>, keys: string[]): boolean =>
  Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));

/** `relative_days` -> evaluation day + n (dates, 'YYYY-MM-DD') or evaluation time + n days (timestamps, ISO). */
function resolveValue(spec: CatalogField, value: unknown, ctx: EvaluationContext): unknown {
  if (!isObject(value) || typeof value.relative_days !== 'number') return value;
  const days = value.relative_days;
  if (spec.value_type === 'date') {
    return new Date(Date.parse(`${ctx.localDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  }
  return new Date(Date.parse(ctx.at) + days * DAY_MS).toISOString();
}

/** Value shape for the operator: a list for in / nin, a pair for between, a boolean for is_null. */
function leafValues(leaf: Leaf, env: LeafEnv): unknown[] {
  const bad = () => new SegmentTranslateError(`${env.path}.value`, `invalid value for ${leaf.operator}`);
  const { operator, value } = leaf;
  if (operator === 'is_null') {
    if (typeof value !== 'boolean') throw bad();
    return [value];
  }
  if (operator === 'in' || operator === 'nin' || operator === 'between') {
    if (!Array.isArray(value) || value.length === 0 || (operator === 'between' && value.length !== 2)) throw bad();
    return value.map((v) => resolveValue(env.spec, v, env.ctx));
  }
  if (value === null || value === undefined || Array.isArray(value)) throw bad();
  return [resolveValue(env.spec, value, env.ctx)];
}

function translateLeaf(node: Record<string, unknown>, path: string, target: SegmentTarget, fields: Map<string, CatalogField>, ctx: EvaluationContext): Where {
  if (!hasExactKeys(node, ['field', 'operator', 'value'])) throw new SegmentTranslateError(path, 'not a condition');
  const spec = typeof node.field === 'string' ? fields.get(node.field) : undefined;
  if (!spec) throw new SegmentTranslateError(`${path}.field`, `unknown field ${String(node.field)}`);
  if (typeof node.operator !== 'string' || !spec.operators.includes(node.operator)) {
    throw new SegmentTranslateError(`${path}.operator`, `operator not allowed for ${spec.field}`);
  }
  const leaf: Leaf = { field: spec.field, operator: node.operator, value: node.value };
  const env: LeafEnv = { target, spec, ctx, path };
  const values = leafValues(leaf, env);
  return translateDerived(leaf, values, env) ?? columnLeaf(spec.field, leaf, values, isNullable(spec));
}

function translateNode(node: unknown, path: string, target: SegmentTarget, fields: Map<string, CatalogField>, ctx: EvaluationContext): Where {
  if (!isObject(node)) throw new SegmentTranslateError(path, 'not an object');
  if (!Object.hasOwn(node, 'op')) return translateLeaf(node, path, target, fields, ctx);
  if (!hasExactKeys(node, ['op', 'children'])) throw new SegmentTranslateError(path, 'not a group');
  const { op, children } = node;
  if (op !== 'and' && op !== 'or' && op !== 'not') throw new SegmentTranslateError(`${path}.op`, 'unknown group operator');
  if (!Array.isArray(children) || children.length === 0 || (op === 'not' && children.length !== 1)) {
    throw new SegmentTranslateError(`${path}.children`, 'invalid children');
  }
  const translated = children.map((child, i) => translateNode(child, `${path}.children[${i}]`, target, fields, ctx));
  return op === 'not' ? { _not: translated[0] } : { [`_${op}`]: translated };
}

/** The condition tree as a Hasura boolean expression (no organization / status scoping). */
export function translateConditions(target: SegmentTarget, conditions: unknown, catalog: CatalogField[], ctx: EvaluationContext): Where {
  return translateNode(conditions, '$', target, new Map(catalog.map((f) => [f.field, f])), ctx);
}

/**
 * Full `where` of a segment: organization scope, merged and synthetic (face auth sandbox) identities excluded
 * (profiles: any status), people with restricted processing excluded (profiles with `processing_restricted`,
 * identities linked to one; slice 10), conditions.
 */
export function segmentWhere(
  target: SegmentTarget,
  conditions: unknown,
  catalog: CatalogField[],
  ctx: EvaluationContext,
  organizationId: string,
): Where {
  const scope: Where[] = [{ organization_id: { _eq: organizationId } }];
  if (target === 'identities') {
    scope.push(
      { status: { _neq: 'merged' } },
      { is_synthetic: { _eq: false } },
      { _not: { profile: { processing_restricted: { _eq: true } } } },
    );
  } else {
    scope.push({ processing_restricted: { _eq: false } });
  }
  return { _and: [...scope, translateConditions(target, conditions, catalog, ctx)] };
}
