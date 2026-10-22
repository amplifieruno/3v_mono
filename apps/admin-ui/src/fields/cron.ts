import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { checkCron } from './cron-format';
import { problemValidator } from './field-issue';

/** The field implementation id of {@link cronField} (`./cron-impl.ts`). */
export const CRON_FIELD = 'itap.cron';

export interface CronFieldOptions {
  readonly texts?: string | FieldTexts;
  readonly required?: boolean;
}

/**
 * A cron in a `text` column (report schedules), in the 5-field subset the data layer accepts
 * (`itap.valid_cron`, `./cron-format.ts`). Input = the expression with a few common schedules to pick
 * and its sentence under it; display = the sentence (`At 07:00 on Monday`) with the expression beside
 * it. A cron the database refuses is refused by the form and flagged on display.
 */
export function cronField(opts: CronFieldOptions = {}) {
  const base = f.string({
    ...(opts.required ? { required: true } : { nullable: true }),
    validate: problemValidator<string>(checkCron),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, input: CRON_FIELD, display: CRON_FIELD }, meta: {} };
}
