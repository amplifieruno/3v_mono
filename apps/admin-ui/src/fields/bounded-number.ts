import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, f } from '@burojs/field-types';
import { type FieldProblem, problemValidator } from './field-issue';

/** The accepted range of a {@link boundedNumber} field; `max` absent = no upper bound. */
export interface NumberRange {
  readonly min: number;
  readonly max?: number;
  /** Whole numbers only (an `integer`/`bigint` column). */
  readonly integer?: boolean;
}

export interface BoundedNumberOptions extends NumberRange {
  readonly texts: FieldTexts;
}

/**
 * The refusal of a value outside `range`; it names the range. Codes `number.range`,
 * `number.rangeWhole`, `number.atLeast`, `number.atLeastWhole`; params `min`, `max`.
 */
export function rangeProblem(range: NumberRange): FieldProblem {
  const whole = range.integer === true;
  const kind = whole ? 'a whole number' : 'a number';
  const suffix = whole ? 'Whole' : '';
  return range.max === undefined
    ? {
        code: `number.atLeast${suffix}`,
        text: `Enter ${kind} of at least ${range.min}.`,
        params: { min: range.min },
      }
    : {
        code: `number.range${suffix}`,
        text: `Enter ${kind} from ${range.min} to ${range.max}.`,
        params: { min: range.min, max: range.max },
      };
}

/** `null` when `value` lies in `range` (an empty value is the `required` rule's concern), else the refusal. */
export function checkRange(value: unknown, range: NumberRange): FieldProblem | null {
  if (value === null || value === undefined || value === '') return null;
  const inRange =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!range.integer || Number.isInteger(value)) &&
    value >= range.min &&
    (range.max === undefined || value <= range.max);
  return inRange ? null : rangeProblem(range);
}

/** {@link checkRange} as a field validator: a translatable issue naming the range. */
export const rangeValidator = (range: NumberRange): FieldValidator<number> =>
  problemValidator<number>((value) => checkRange(value, range));

/**
 * A required number field limited to `range`. The record form does not enforce the
 * declaration's own `min`/`max` (it validates presence and `validate` only), so the
 * range is restated as `validate`, whose message names the range (`tasks/ui/buro-gaps.md`
 * G14). Callers mirror the database CHECK constraint where the column has one.
 */
export function boundedNumber(options: BoundedNumberOptions) {
  const { texts, ...range } = options;
  return f.number({
    required: true,
    min: range.min,
    ...(range.max === undefined ? {} : { max: range.max }),
    ...(range.integer ? { integer: true } : {}),
    validate: rangeValidator(range),
    texts,
  });
}
