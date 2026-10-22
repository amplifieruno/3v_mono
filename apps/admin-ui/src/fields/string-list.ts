import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateStringList } from './string-list-format';

/** The field implementation id of {@link stringList} (`./string-list-impl.ts`). */
export const STRING_LIST_FIELD = 'itap.string-list';

export interface StringListOptions {
  /** How one entry is named in messages and on the buttons, capitalized (`Option`). */
  readonly item: string;
  readonly required?: boolean;
  readonly nullable?: boolean;
  readonly texts?: string | FieldTexts;
}

/** {@link validateStringList} as a field validator: a translatable issue on the field. */
export function checkStringList(item: string): FieldValidator {
  return problemValidator((value) => validateStringList(value, { item }));
}

/**
 * A list of distinct texts in a `jsonb` array column (the options of a select custom
 * attribute). Input = one text box per entry with add and remove; display = the
 * entries side by side. `required` refuses an empty list (the form counts `[]` as missing).
 */
export function stringList(opts: StringListOptions) {
  const nullable = opts.nullable ?? false;
  // One declared options type: conditional spreads would make the field's static metadata a union.
  const jsonOpts: JsonFieldOpts = {
    required: opts.required === true,
    ...(nullable ? { nullable: true } : { default: [] }),
    validate: checkStringList(opts.item),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  };
  const base = f.json(jsonOpts);
  return {
    ...base,
    ui: { ...base.ui, input: STRING_LIST_FIELD, display: STRING_LIST_FIELD },
    meta: { nullable, item: opts.item },
  };
}
