import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateWindows } from './time-windows-format';

/** The field implementation id of {@link timeWindows} (`./time-windows-impl.ts`). */
export const TIME_WINDOWS_FIELD = 'itap.time-windows';

export interface TimeWindowsOptions {
  /**
   * What an empty list means for this column, shown by the display and the input when
   * there are no windows. The meaning differs per column: `work_schedules.windows` `[]`
   * is never on shift (`itap.in_windows` is false), `facilities.operating_hours` `[]` is
   * always open (after-hours checks are skipped). Say it: `Never on shift`, `Always open`.
   */
  readonly emptyText: string;
  /** The column allows `null`; a removed last row then writes `null`, else `[]`. */
  readonly nullable?: boolean;
  readonly texts?: string | FieldTexts;
}

/** {@link validateWindows} as a field validator: a translatable issue on the field before any request. */
export const checkTimeWindows = problemValidator(validateWindows);

/**
 * Weekly time windows in a `jsonb` column (`[{ days, from, to }]`, data-layer §6.0):
 * work schedules, on-call schedules, access policies, segment conditions. Input = one
 * row per window (weekday toggles, from/to); display = compact text such as
 * `Mon–Fri 08:00–18:00; Sat 22:00–06:00 (overnight)`, or `emptyText` for no windows.
 */
export function timeWindows(opts: TimeWindowsOptions) {
  const nullable = opts.nullable ?? false;
  const base = f.json({
    // Not `required`: the form counts `[]` as missing, and an empty list is a valid value.
    ...(nullable ? { nullable: true } : { default: [] }),
    validate: checkTimeWindows,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: TIME_WINDOWS_FIELD, display: TIME_WINDOWS_FIELD },
    meta: { nullable, emptyText: opts.emptyText },
  };
}
