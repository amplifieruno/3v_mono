import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, f } from '@burojs/field-types';
import { problemIssue } from './field-issue';
import { validateParameters } from './event-rule-parameters-format';

/** The field implementation id of {@link eventRuleParameters} (`./event-rule-parameters-impl.ts`). */
export const EVENT_RULE_PARAMETERS_FIELD = 'itap.event-rule-parameters';

export interface EventRuleParametersOptions {
  /** The record field holding the rule type the parameters belong to (`rule_type`). */
  readonly typeField: string;
  readonly texts?: string | FieldTexts;
}

/**
 * {@link validateParameters} as a field validator: the rule type comes from the form values
 * (or, on a form that does not carry it, the shape alone is checked).
 */
export function checkEventRuleParameters(typeField: string): FieldValidator {
  const validate = (value: unknown, ctx?: { readonly values?: Readonly<Record<string, unknown>> }) => {
    const problem = validateParameters(value, ctx?.values?.[typeField]);
    return problem === null ? null : problemIssue(problem);
  };
  // buro's runner accepts an issue object from the function form (`./field-issue.ts`).
  return validate as unknown as FieldValidator;
}

/**
 * An event rule version's `parameters` jsonb, edited by the rule's type (read from the record's
 * `typeField`): an unusual-dwell rule's dwell time in minutes, a watch-list rule's watch-list kinds,
 * and for the other types a note saying where their thresholds come from. Keys the type does not
 * read are kept as stored. Display = the parameters as label and value pairs.
 */
export function eventRuleParameters(opts: EventRuleParametersOptions) {
  const base = f.json({
    default: {},
    validate: checkEventRuleParameters(opts.typeField),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: EVENT_RULE_PARAMETERS_FIELD, display: EVENT_RULE_PARAMETERS_FIELD },
    meta: { typeField: opts.typeField },
  };
}
