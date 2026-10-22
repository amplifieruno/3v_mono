import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link dateTime} (`./date-time-impl.ts`). */
export const DATE_TIME_FIELD = 'itap.date-time';

export interface DateTimeOptions {
  readonly texts?: string | FieldTexts;
  readonly required?: boolean;
  /** A column only the platform writes (shown, never edited). */
  readonly system?: boolean;
  readonly in?: readonly ('list' | 'show' | 'create' | 'edit')[];
}

/**
 * A `timestamptz` column shown and edited with its time of day: the kit's date-time input and
 * display show the date only (buro 0.6, `tasks/ui/buro-gaps.md` G37). Input = the browser's
 * local date and time (`datetime-local`), stored as an ISO instant; display = date and time in
 * the console's locale.
 */
export function dateTime(opts: DateTimeOptions = {}) {
  const base = f.dateTime({
    ...(opts.required ? { required: true } : { nullable: true }),
    ...(opts.system ? { system: true } : {}),
    ...(opts.in === undefined ? {} : { in: opts.in }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, input: DATE_TIME_FIELD, display: DATE_TIME_FIELD }, meta: {} };
}
