import type { FieldValidator } from '@burojs/field-types';
import { type FieldProblem, problemValidator } from './field-issue';

/**
 * `null` unless `value` is text that is no `#rrggbb` colour (the `*_color_hex` CHECKs of watch
 * lists and segments); empty is no colour.
 */
export function hexColorProblem(value: unknown): FieldProblem | null {
  if (value === null || value === undefined || value === '') return null;
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/u.test(value)
    ? null
    : { code: 'color.hex', text: 'Enter a colour as #rrggbb, such as #d97706.' };
}

/** {@link hexColorProblem} as a field validator. */
export function checkHexColor<TValue = unknown>(): FieldValidator<TValue> {
  return problemValidator<TValue>(hexColorProblem);
}
