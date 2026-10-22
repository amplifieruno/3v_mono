import type { FieldTexts, StandardSchemaV1 } from '@burojs/core';
import { f } from '@burojs/field-types';
import { type TimeWindow, validateWindows } from './time-windows-format';

/** The field implementation id of {@link timeWindows} (`./time-windows-impl.ts`). */
export const TIME_WINDOWS_FIELD = 'itap.time-windows';

export interface TimeWindowsOptions {
  /** The column allows `null` (no restriction); a removed last row then writes `null`, else `[]`. */
  readonly nullable?: boolean;
  readonly texts?: string | FieldTexts;
}

/**
 * The window shape as a Standard Schema (`./time-windows-format.ts` `validateWindows`):
 * the form shows its one issue on the field before any request.
 */
export const timeWindowsSchema: StandardSchemaV1<unknown, readonly TimeWindow[] | null> = {
  '~standard': {
    version: 1,
    vendor: 'itap',
    validate: (value) => {
      const message = validateWindows(value);
      return message === null
        ? { value: (value ?? null) as readonly TimeWindow[] | null }
        : { issues: [{ message }] };
    },
  },
};

/**
 * Weekly time windows in a `jsonb` column (`[{ days, from, to }]`, data-layer §6.0):
 * work schedules, on-call schedules, access policies, segment conditions. Input = one
 * row per window (weekday toggles, from/to); display = compact text such as
 * `Mon–Fri 08:00–18:00; Sat 22:00–06:00 (overnight)`.
 */
export function timeWindows(opts: TimeWindowsOptions = {}) {
  const nullable = opts.nullable ?? false;
  const base = f.json({
    // Not `required`: the form counts `[]` as missing, and an empty list is a valid value.
    ...(nullable ? { nullable: true } : { default: [] }),
    validate: timeWindowsSchema,
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: TIME_WINDOWS_FIELD, display: TIME_WINDOWS_FIELD },
    meta: { nullable },
  };
}
