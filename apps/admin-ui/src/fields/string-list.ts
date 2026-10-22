import type { FieldTexts, StandardSchemaV1 } from '@burojs/core';
import { type JsonFieldOpts, f } from '@burojs/field-types';
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

/** {@link validateStringList} as a Standard Schema: the form shows its issue on the field. */
export function stringListSchema(
  item: string,
): StandardSchemaV1<unknown, readonly string[] | null> {
  return {
    '~standard': {
      version: 1,
      vendor: 'itap',
      validate: (value) => {
        const message = validateStringList(value, { item });
        return message === null
          ? { value: (value ?? null) as readonly string[] | null }
          : { issues: [{ message }] };
      },
    },
  };
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
    validate: stringListSchema(opts.item),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  };
  const base = f.json(jsonOpts);
  return {
    ...base,
    ui: { ...base.ui, input: STRING_LIST_FIELD, display: STRING_LIST_FIELD },
    meta: { nullable, item: opts.item },
  };
}
