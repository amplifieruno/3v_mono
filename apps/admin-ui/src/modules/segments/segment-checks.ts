import type { Check, CheckDI, FlowUnknownCheck } from '@burojs/core';
import { resourceByName } from '../../data/resource-by-name';
import { EVENT_RULE_SCOPE_HISTORY_RESOURCE, SEGMENT_RESOURCE } from '../../data/resource-names';

/** `true` for no conditions: nothing, or an empty object (`'{}'`, what a manual segment holds). */
export function conditionsEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true;
  return typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0;
}

const kindOf = (values: Readonly<Record<string, unknown>>, record: Readonly<Record<string, unknown>> | undefined) =>
  values.kind ?? record?.kind;

/** The instant of a date-time value, or `null`. */
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || value === '') return null;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : at;
};

/**
 * Whether event rule versions (any status) are scoped to the segment being archived: `scoped`,
 * `clear`, `unknown` when the read failed, or `null` when the edit does not archive it.
 */
async function archiveScope(di: CheckDI): Promise<'scoped' | 'clear' | 'unknown' | null> {
  const id = di.record?.id;
  if (di.values.status !== 'archived' || !di.changed('status') || typeof id !== 'string') return null;
  try {
    const { data: rows } = await di.data.list(resourceByName(EVENT_RULE_SCOPE_HISTORY_RESOURCE) as never, {
      filter: { field: 'segment_id', op: 'eq', value: id },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (rows as readonly unknown[]).length > 0 ? 'scoped' : 'clear';
  } catch {
    return 'unknown';
  }
}

/**
 * The segment form's checks, restating the database:
 * - `segments_conditions_match_kind` / `segment_conditions_required`: a dynamic segment has
 *   conditions (a manual one never shows the field, so it keeps `{}`);
 * - `segments_active_window_ordered`: the end of the active window is after its start;
 * - archiving a segment rule versions are scoped to is allowed (the server keeps the scope), but
 *   it is said first: an archived segment gains no members, so those rules stop matching anyone new
 *   (event rule scopes only; notification-rule conditions are jsonb, not readable by a filter).
 *   When the scopes cannot be read, a generic confirm asks instead.
 */
export const SEGMENT_CHECKS: Check[] = [
  {
    id: 'dynamicConditions',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'conditions',
    texts: 'A dynamic segment needs conditions: who belongs to it.',
    when: ({ values, record }) => kindOf(values, record) === 'dynamic' && conditionsEmpty(values.conditions),
  },
  {
    id: 'activeWindowOrdered',
    on: ['create', 'edit'],
    severity: 'error',
    anchor: 'active_until',
    texts: 'Active until must be after Active from.',
    when: ({ values }) => {
      const from = instant(values.active_from);
      const until = instant(values.active_until);
      return from !== null && until !== null && until <= from;
    },
  },
  {
    id: 'archiveScoped',
    on: ['edit'],
    severity: 'warning',
    show: 'confirm',
    anchor: 'status',
    texts:
      'Event rules are scoped to this segment. Archived, it gains no members and a dynamic one loses its rule members, so those rules stop applying to the people it held. Archive it anyway?',
    when: async (di) => (await archiveScope(di)) === 'scoped',
  },
  {
    // The references could not be read: still ask, rather than archive without a word.
    id: 'archiveUnchecked',
    on: ['edit'],
    severity: 'warning',
    show: 'confirm',
    anchor: 'status',
    texts:
      'Could not check whether event rules are scoped to this segment. Archived, it gains no members and a dynamic one loses its rule members. Archive it anyway?',
    when: async (di) => (await archiveScope(di)) === 'unknown',
  },
];

/** Check again for Delete: the segment is gone. */
export const segmentDeleted: FlowUnknownCheck = async ({ record, data }) => {
  const id = record?.id;
  if (typeof id !== 'string' || id === '') return 'unknown';
  try {
    const { data: rows } = await data.many(resourceByName(SEGMENT_RESOURCE) as never, { ids: [id] } as never);
    return (rows as readonly unknown[]).length === 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};
