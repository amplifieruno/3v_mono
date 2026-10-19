import { columnLeaf, comparison, type Leaf, type LeafEnv } from './compare.js';
import type { Where } from './types.js';

/** Fields that are not plain columns of the target table (behavioral metrics, jsonb paths, derived fields). */

const DAY_MS = 86_400_000;
const STATS = { profiles: 'profile_activity_stats', identities: 'identity_activity_stats' } as const;
const METRIC_COLUMNS: Record<string, string> = {
  visits_last_30d: 'visits_last_30d',
  avg_dwell_minutes: 'avg_dwell_minutes',
  after_hours_visits_30d: 'after_hours_visits_30d',
  // Most entered area in the stats window (activity stats top_area_id).
  visited_area_id: 'top_area_id',
};
const OPEN_MEMBERSHIP = { removed_at: { _is_null: true } };

/** is_null on a stats column: no stats row counts as null. */
function statsIsNull(rel: string, column: string, isNull: unknown): Where {
  if (isNull === true) return { _or: [{ _not: { [rel]: {} } }, { [rel]: { [column]: { _is_null: true } } }] };
  return { [rel]: { [column]: { _is_null: false } } };
}

function metric(leaf: Leaf, values: unknown[], env: LeafEnv): Where {
  const rel = STATS[env.target];
  const column = METRIC_COLUMNS[leaf.field];
  if (leaf.operator === 'is_null') return statsIsNull(rel, column, values[0]);
  return { [rel]: columnLeaf(column, leaf, values, column !== 'top_area_id') };
}

/** last_seen_days_ago = whole days between last_seen_at and the evaluation time: d >= n <=> last_seen_at <= at - n days. */
function lastSeenDaysAgo(leaf: Leaf, values: unknown[], env: LeafEnv): Where {
  const rel = STATS[env.target];
  if (leaf.operator === 'is_null') return statsIsNull(rel, 'last_seen_at', values[0]);
  const ago = (n: unknown) => new Date(Date.parse(env.ctx.at) - Number(n) * DAY_MS).toISOString();
  const eq = (n: unknown): Where => ({ last_seen_at: { _gt: ago(Number(n) + 1), _lte: ago(n) } });
  const neq = (n: unknown): Where => ({ _or: [{ last_seen_at: { _gt: ago(n) } }, { last_seen_at: { _lte: ago(Number(n) + 1) } }] });
  const [n, m] = values;
  const cmp: Record<string, () => Where> = {
    eq: () => eq(n),
    neq: () => neq(n),
    in: () => ({ _or: values.map(eq) }),
    nin: () => ({ _and: values.map(neq) }),
    gt: () => ({ last_seen_at: { _lte: ago(Number(n) + 1) } }),
    gte: () => ({ last_seen_at: { _lte: ago(n) } }),
    lt: () => ({ last_seen_at: { _gt: ago(n) } }),
    lte: () => ({ last_seen_at: { _gt: ago(Number(n) + 1) } }),
    between: () => ({ last_seen_at: { _lte: ago(n), _gt: ago(Number(m) + 1) } }),
  };
  return { [rel]: cmp[leaf.operator]() };
}

/** attributes.<key> / custom_fields.<key>: containment for equality, key presence (non-null value) otherwise. */
function jsonPath(leaf: Leaf, values: unknown[]): Where {
  const dot = leaf.field.indexOf('.');
  const column = leaf.field.slice(0, dot);
  const key = leaf.field.slice(dot + 1);
  const has = (v: unknown): Where => ({ [column]: { _contains: { [key]: v } } });
  const present: Where = { _and: [{ [column]: { _has_key: key } }, { _not: has(null) }] };
  switch (leaf.operator) {
    case 'eq':
      return has(values[0]);
    case 'in':
      return { _or: values.map(has) };
    case 'neq':
    case 'nin':
      return { _and: [present, ...values.map((v) => ({ _not: has(v) }))] };
    default: // is_null
      return values[0] === true ? { _not: present } : present;
  }
}

function onShiftNow(values: unknown[], env: LeafEnv): Where {
  const ids = env.ctx.onShiftScheduleIds;
  if (values[0] === true) return { work_schedule_id: { _in: ids } };
  return { _or: [{ work_schedule_id: { _is_null: true } }, { work_schedule_id: { _nin: ids } }] };
}

/** Visits of the profile as visitor expected on the organization-local evaluation day; any of them may match. */
function visitStatusToday(leaf: Leaf, values: unknown[], env: LeafEnv): Where {
  const today = { expected_start: { _gte: env.ctx.dayStart, _lt: env.ctx.dayEnd } };
  const visits = (cmp: Where): Where => ({ visits_by_visitor_profile: cmp });
  switch (leaf.operator) {
    case 'is_null':
      return values[0] === true ? { _not: visits(today) } : visits(today);
    case 'eq':
    case 'in':
      return visits({ ...today, status: comparison(leaf.operator, values) });
    default: // neq / nin: has a visit today, none of them with the status
      return { _and: [visits(today), { _not: visits({ ...today, status: comparison(leaf.operator === 'neq' ? 'eq' : 'in', values) }) }] };
  }
}

function memberOfSegment(leaf: Leaf, values: unknown[]): Where {
  const positive = leaf.operator === 'eq' || leaf.operator === 'in';
  const ids = comparison(leaf.operator === 'eq' || leaf.operator === 'neq' ? 'eq' : 'in', values);
  const member = { segment_members: { segment_id: ids, ...OPEN_MEMBERSHIP } };
  return positive ? member : { _not: member };
}

/** Translation of a non-column field, or undefined for plain columns / scalar computed fields. */
export function translateDerived(leaf: Leaf, values: unknown[], env: LeafEnv): Where | undefined {
  if (Object.hasOwn(METRIC_COLUMNS, leaf.field)) return metric(leaf, values, env);
  if (leaf.field === 'last_seen_days_ago') return lastSeenDaysAgo(leaf, values, env);
  if (leaf.field.includes('.')) return jsonPath(leaf, values);
  if (leaf.field === 'member_of_segment') return memberOfSegment(leaf, values);
  if (env.target === 'profiles' && leaf.field === 'on_shift_now') return onShiftNow(values, env);
  if (env.target === 'profiles' && leaf.field === 'visit_status_today') return visitStatusToday(leaf, values, env);
  if (env.target === 'identities' && leaf.field === 'linked') return { profile_id: { _is_null: values[0] !== true } };
  return undefined;
}
