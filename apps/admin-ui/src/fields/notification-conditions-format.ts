/**
 * A notification rule's conditions (`notification_rules.conditions`), the small rule language of
 * the database (`itap.validate_notification_rule_conditions`, migrations `…051`, `…104`): one JSON
 * object whose keys are all optional and must all match (AND). `{}` matches every event of the
 * rule's event types.
 *
 * - `facility_id` — a facility of the organization: the event's facility.
 * - `area_id` — an area of the organization (of `facility_id` when both are set): the event's
 *   area or an area inside it (`areas.path`).
 * - `segment_id` — a segment of the organization: the event's person or face is a member at the
 *   event time (`itap.subject_in_segment`).
 * - `min_severity` — an event severity: the event is at least that severe (`itap.severity_rank`).
 *
 * Any other key, a value that is not a string, an id that is not a uuid or names nothing of the
 * organization, an area outside the chosen facility or an unknown severity is refused
 * (`notification_rule_conditions_invalid`).
 */
import { EVENT_SEVERITIES } from '../enums/events';
import type { FieldProblem } from './field-issue';

/** The keys of the language, in the order the editor and the display show them. */
export const CONDITION_KEYS = ['facility_id', 'area_id', 'segment_id', 'min_severity'] as const;

export type ConditionKey = (typeof CONDITION_KEYS)[number];

/** The keys whose value is the id of a record of the organization. */
export const REFERENCE_KEYS = ['facility_id', 'area_id', 'segment_id'] as const;

export type ReferenceKey = (typeof REFERENCE_KEYS)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A problem of the conditions, on the condition (`node`) it belongs to, or on the whole object. */
export interface ConditionProblem extends FieldProblem {
  readonly node?: ConditionKey | string;
}

/** The records a rule can name, as the organization holds them now (`./notification-conditions-query.ts`). */
export interface ConditionReferences {
  readonly facilities: readonly { readonly id: string; readonly name: string }[];
  readonly areas: readonly { readonly id: string; readonly name: string; readonly facility_id: string }[];
  readonly segments: readonly { readonly id: string; readonly name: string }[];
}

export const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The stored object, or `{}` for nothing stored. */
export function conditionsOf(value: unknown): Readonly<Record<string, unknown>> {
  return isPlainObject(value) ? value : {};
}

/** The condition's value when it is a non-empty string, else `undefined`. */
export function conditionValue(value: unknown, key: ConditionKey): string | undefined {
  const stored = conditionsOf(value)[key];
  return typeof stored === 'string' && stored !== '' ? stored : undefined;
}

/** `value` with `key` set, or removed when `next` is `undefined`; every other key untouched. */
export function withCondition(value: unknown, key: ConditionKey, next: string | undefined): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...conditionsOf(value) };
  if (next === undefined) delete copy[key];
  else copy[key] = next;
  return copy;
}

/**
 * The conditions with the facility changed: an area that is not in the new facility is dropped
 * with it (the database refuses an area outside the facility), so the editor never offers that
 * combination.
 */
export function withFacility(value: unknown, facilityId: string | undefined, refs: ConditionReferences | undefined): Record<string, unknown> {
  const next = withCondition(value, 'facility_id', facilityId);
  const areaId = conditionValue(next, 'area_id');
  if (facilityId === undefined || areaId === undefined || refs === undefined) return next;
  const area = refs.areas.find((row) => row.id === areaId);
  return area === undefined || area.facility_id === facilityId ? next : withCondition(next, 'area_id', undefined);
}

/** The areas the editor offers: those of the chosen facility, or every area when none is chosen. */
export function areaChoices(value: unknown, refs: ConditionReferences): ConditionReferences['areas'] {
  const facilityId = conditionValue(value, 'facility_id');
  return facilityId === undefined ? refs.areas : refs.areas.filter((area) => area.facility_id === facilityId);
}

function sameId(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * `null` when the conditions are what the database accepts, else the first problem, on its node.
 * Without `refs` the shape alone is checked (keys, strings, uuids, severities); with them, each
 * id must name a record of the organization and the area must lie in the chosen facility.
 */
export function validateConditions(value: unknown, refs?: ConditionReferences): ConditionProblem | null {
  if (!isPlainObject(value)) {
    return { code: 'notificationConditions.notObject', text: 'Conditions must be an object of named values.' };
  }
  for (const key of Object.keys(value)) {
    if (!(CONDITION_KEYS as readonly string[]).includes(key)) {
      return {
        code: 'notificationConditions.unknownKey',
        text: `Unknown condition “${key}”: remove it (only facility, area, segment and minimum severity are understood).`,
        params: { key },
        node: key,
      };
    }
  }
  for (const key of REFERENCE_KEYS) {
    if (!(key in value)) continue;
    const id = value[key];
    if (typeof id !== 'string' || !UUID.test(id)) {
      return { code: 'notificationConditions.badId', text: 'Choose a record from the list.', node: key };
    }
  }
  if ('min_severity' in value && !(EVENT_SEVERITIES as readonly unknown[]).includes(value.min_severity)) {
    return { code: 'notificationConditions.badSeverity', text: 'Choose one of the event severities.', node: 'min_severity' };
  }
  return refs === undefined ? null : validateReferences(value, refs);
}

/** The reference checks of {@link validateConditions}: ids of the organization, the area in the facility. */
function validateReferences(value: Readonly<Record<string, unknown>>, refs: ConditionReferences): ConditionProblem | null {
  const facilityId = conditionValue(value, 'facility_id');
  const areaId = conditionValue(value, 'area_id');
  const segmentId = conditionValue(value, 'segment_id');
  const gone = (node: ReferenceKey): ConditionProblem => ({
    code: 'notificationConditions.gone',
    text: 'It no longer exists in the organization: choose another or clear it.',
    node,
  });
  if (facilityId !== undefined && !refs.facilities.some((row) => sameId(row.id, facilityId))) return gone('facility_id');
  if (areaId !== undefined) {
    const area = refs.areas.find((row) => sameId(row.id, areaId));
    if (area === undefined) return gone('area_id');
    if (facilityId !== undefined && !sameId(area.facility_id, facilityId)) {
      return {
        code: 'notificationConditions.areaOutsideFacility',
        text: 'The area is not in the chosen facility: choose one of its areas or clear the area.',
        node: 'area_id',
      };
    }
  }
  if (segmentId !== undefined && !refs.segments.some((row) => sameId(row.id, segmentId))) return gone('segment_id');
  return null;
}

/** The condition a validation issue belongs to: the last segment of its path, when it names one. */
export function issueNode(issue: { readonly path: readonly unknown[] }): string | undefined {
  const last = issue.path[issue.path.length - 1];
  return issue.path.length > 0 && typeof last === 'string' ? last : undefined;
}
