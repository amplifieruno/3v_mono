import { RETENTION_ACTIONS, RETENTION_DATA_CLASSES, type RetentionAction, type RetentionDataClass } from '../../enums/compliance';

/*
 * The class rules of `itap.retention_policies`, mirrored from the database (the server is the
 * authority; these only let the form say it first):
 * - `itap.retention_class_has_facility`: the classes whose rows belong to one facility take a
 *   facility-specific policy (CHECK `retention_policies_facility_dimension`);
 * - `itap.retention_action_allowed`: the actions each class accepts (CHECK
 *   `retention_policies_action_valid`);
 * - `itap.retention_min_days`: the floor of each class, 365 days for the audit log and face
 *   authentication attempts, else 1 (CHECK `retention_policies_retain_days`, at most 36 500).
 * `tests/modules/retention-policies.test.ts` holds the tables to every class of the enum.
 */

/** `retention_policies_retain_days`: the upper bound of every class. */
export const MAX_RETAIN_DAYS = 36_500;

/** Classes whose rows belong to one facility (`itap.retention_class_has_facility`). */
export const FACILITY_CLASSES: readonly RetentionDataClass[] = [
  'detections',
  'locations',
  'sessions',
  'events',
  'incidents',
  'access_decisions',
  'terminal_syncs',
  'stats',
];

const ANONYMIZE_CLASSES: readonly RetentionDataClass[] = [
  'detections',
  'sessions',
  'events',
  'incidents',
  'access_decisions',
  'auth_attempts',
  'unknown_identities',
  'audit',
];
const ARCHIVE_CLASSES: readonly RetentionDataClass[] = ['reports', 'bulk_jobs'];

/** Classes kept at least a year (`itap.retention_min_days`). */
const YEAR_FLOOR_CLASSES: readonly RetentionDataClass[] = ['audit', 'auth_attempts'];

const isClass = (value: unknown): value is RetentionDataClass =>
  typeof value === 'string' && (RETENTION_DATA_CLASSES as readonly string[]).includes(value);

/** Whether a policy of `dataClass` may name one facility. */
export function classHasFacility(dataClass: unknown): boolean {
  return isClass(dataClass) && FACILITY_CLASSES.includes(dataClass);
}

/** The actions `dataClass` accepts, in enum order (delete is accepted by every class). */
export function allowedActions(dataClass: unknown): readonly RetentionAction[] {
  if (!isClass(dataClass)) return [];
  return RETENTION_ACTIONS.filter(
    (action) =>
      action === 'delete' ||
      (action === 'anonymize' && ANONYMIZE_CLASSES.includes(dataClass)) ||
      (action === 'archive' && ARCHIVE_CLASSES.includes(dataClass)),
  );
}

/** Whether `dataClass` accepts `action`. */
export function actionAllowed(dataClass: unknown, action: unknown): boolean {
  return (allowedActions(dataClass) as readonly unknown[]).includes(action);
}

/** The fewest days a policy of `dataClass` may keep its rows. */
export function minRetainDays(dataClass: unknown): number {
  return isClass(dataClass) && YEAR_FLOOR_CLASSES.includes(dataClass) ? 365 : 1;
}

/** Whether `days` is below the floor of `dataClass` (an empty value is the `required` rule's concern). */
export function belowFloor(dataClass: unknown, days: unknown): boolean {
  return typeof days === 'number' && isClass(dataClass) && days < minRetainDays(dataClass);
}
