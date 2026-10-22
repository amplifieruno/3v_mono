import type { FieldValidator } from '@burojs/field-types';
import { type FieldProblem, problemValidator } from './field-issue';

/**
 * `null` unless `value` is a string of spaces only: `required` counts any non-empty string, so a
 * text the database trims (`btrim(x) <> ''`) needs this as well. Empty and missing values are
 * left to `required`.
 */
export function validateNotBlank(value: unknown): FieldProblem | null {
  return typeof value === 'string' && value !== '' && value.trim() === ''
    ? { code: 'text.blank', text: 'Enter some text, not only spaces.' }
    : null;
}

/** {@link validateNotBlank} as a field validator: a translatable issue on the field. */
export function checkNotBlank<TValue = unknown>(): FieldValidator<TValue> {
  return problemValidator<TValue>(validateNotBlank);
}
