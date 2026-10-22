import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { checkTimezone } from './timezone-zones';

/** The field implementation id of {@link timezone} (`./timezone-impl.ts`). */
export const TIMEZONE_FIELD = 'itap.timezone';

export interface TimezoneOptions {
  readonly texts?: string | FieldTexts;
  readonly required?: boolean;
  /** The create form's initial zone (the column's database default, often `UTC`). */
  readonly default?: string;
}

/**
 * An IANA time zone in a `text` column (facilities, work and on-call schedules, report
 * schedules, access policies, segments). Input = a searchable list of zones with their
 * current UTC offset; display = zone and offset. A zone the browser does not know is
 * refused by the form and flagged on display, never shown as UTC. An optional zone can be
 * cleared (`null`).
 */
export function timezone(opts: TimezoneOptions = {}) {
  const base = f.string({
    ...(opts.required ? { required: true } : { nullable: true }),
    ...(opts.default === undefined ? {} : { default: opts.default }),
    validate: problemValidator<string>(checkTimezone),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: TIMEZONE_FIELD, display: TIMEZONE_FIELD },
    // A nullable zone offers Clear in the input.
    meta: { nullable: opts.required !== true },
  };
}
