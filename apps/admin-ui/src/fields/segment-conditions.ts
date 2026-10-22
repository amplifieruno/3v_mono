import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemIssue } from './field-issue';
import { conditionsSnapshot } from './segment-conditions-registry';
import { type ConditionProblem, validateSegmentConditions } from './segment-conditions-validate';

/** The field implementation id of {@link segmentConditions} (`./segment-conditions-impl.ts`). */
export const SEGMENT_CONDITIONS_FIELD = 'itap.segment-conditions';

export interface SegmentConditionsOptions {
  /** The record field holding the target the conditions are about (`target`). */
  readonly targetField: string;
  readonly texts?: string | FieldTexts;
  readonly in?: JsonFieldOpts['in'];
}

/**
 * A condition problem as buro's runner reads it: a translatable issue whose path is the JSON
 * path the database would name (`['$.children[2].value']`, prefixed by the runner with the field
 * name), so the editor marks that node.
 */
export function conditionIssue(problem: ConditionProblem) {
  return { ...problemIssue(problem), path: [problem.path] };
}

/**
 * {@link validateSegmentConditions} as a field validator. The target comes from the form values;
 * the catalog, the records and the segment being edited from the mounted editor
 * (`./segment-conditions-registry.ts`); without them only the grammar is checked. `{}` passes:
 * whether conditions are needed is the form's check (a manual segment keeps `{}`).
 */
export function checkSegmentConditions(targetField: string): FieldValidator {
  const validate = (value: unknown, ctx?: { readonly values?: Readonly<Record<string, unknown>> }) => {
    const target = ctx?.values?.[targetField];
    const snapshot = conditionsSnapshot(typeof target === 'string' && target !== '' ? target : undefined);
    const problems = validateSegmentConditions(value, snapshot ?? (typeof target === 'string' ? { target } : {}));
    return problems.length === 0 ? null : problems.map(conditionIssue);
  };
  // buro's runner accepts a list of issue objects from the function form (`./field-issue.ts`).
  return validate as unknown as FieldValidator;
}

/**
 * A segment's (or template's) `conditions` jsonb, the condition language of the database
 * (`tasks/data-layer/design.md` §6.5): a tree of groups (all / any / not) and conditions over the
 * fields of the target the record's `targetField` holds, offered by the server's catalog
 * (`segment_fields`). Edited as a tree with a value editor per field type; displayed as a
 * readable sentence.
 */
export function segmentConditions(opts: SegmentConditionsOptions) {
  const base = f.json({
    default: {},
    validate: checkSegmentConditions(opts.targetField),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
    ...(opts.in === undefined ? {} : { in: opts.in }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: SEGMENT_CONDITIONS_FIELD, display: SEGMENT_CONDITIONS_FIELD },
    meta: { targetField: opts.targetField },
  };
}
