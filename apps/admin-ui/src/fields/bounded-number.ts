import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

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

/** The sentence a value outside `range` is refused with; it names the range. */
export function rangeMessage(range: NumberRange): string {
  const kind = range.integer ? 'a whole number' : 'a number';
  return range.max === undefined
    ? `Enter ${kind} of at least ${range.min}.`
    : `Enter ${kind} from ${range.min} to ${range.max}.`;
}

/** `null` when `value` lies in `range` (an empty value is the `required` rule's concern), else the message. */
export function checkRange(value: unknown, range: NumberRange): string | null {
  if (value === null || value === undefined || value === '') return null;
  const inRange =
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!range.integer || Number.isInteger(value)) &&
    value >= range.min &&
    (range.max === undefined || value <= range.max);
  return inRange ? null : rangeMessage(range);
}

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
    validate: (value: unknown) => checkRange(value, range),
    texts,
  });
}
