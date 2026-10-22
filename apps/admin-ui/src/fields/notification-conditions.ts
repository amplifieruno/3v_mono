import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, f } from '@burojs/field-types';
import { problemIssue } from './field-issue';
import { type ConditionProblem, validateConditions } from './notification-conditions-format';

/** The field implementation id of {@link notificationConditions} (`./notification-conditions-impl.ts`). */
export const NOTIFICATION_CONDITIONS_FIELD = 'itap.notification-conditions';

export interface NotificationConditionsOptions {
  readonly texts?: string | FieldTexts;
}

/**
 * A condition problem as buro's runner reads it: a translatable issue whose path names the
 * condition (`['area_id']`, prefixed by the runner with the field name), so the editor shows it
 * on that condition's row.
 */
export function conditionIssue(problem: ConditionProblem) {
  const issue = problemIssue(problem);
  return problem.node === undefined ? issue : { ...issue, path: [problem.node] };
}

/**
 * {@link validateConditions} (shape: keys, strings, uuids, severities) as a field validator. The
 * references (ids of the organization, the area in the facility) are checked by the editor
 * against the records it offers, and by the database on save.
 */
export function checkNotificationConditions(): FieldValidator {
  const validate = (value: unknown) => {
    const problem = validateConditions(value ?? {});
    return problem === null ? null : conditionIssue(problem);
  };
  // buro's runner accepts an issue object from the function form (`./field-issue.ts`).
  return validate as unknown as FieldValidator;
}

/**
 * A notification rule's `conditions` jsonb, the rule language of the database: facility, area
 * (and the areas inside it), segment (membership at the event time) and minimum severity, all
 * optional, all must hold. Edited as one row per condition with the organization's records to
 * choose from; displayed as a readable sentence per condition set.
 */
export function notificationConditions(opts: NotificationConditionsOptions = {}) {
  const base = f.json({
    default: {},
    validate: checkNotificationConditions(),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: NOTIFICATION_CONDITIONS_FIELD, display: NOTIFICATION_CONDITIONS_FIELD },
  };
}
