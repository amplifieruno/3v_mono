import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, f } from '@burojs/field-types';
import { NOT_OBJECT, isPlainObject, sameJson, validateCustomFields } from './custom-fields-check';
import { problemValidator } from './field-issue';
import { customFieldsSnapshot } from './custom-fields-registry';

/** The field implementation id of {@link customFields} (`./custom-fields-impl.ts`). */
export const CUSTOM_FIELDS_FIELD = 'itap.custom-fields';

/** The resource of the definitions the input reads (`modules/organization/custom-attributes.ts`). */
export const CUSTOM_ATTRIBUTE_DEFINITION_RESOURCE = 'custom_attribute_definition';

export interface CustomFieldsOptions {
  /** The `custom_attribute_entities` value of the record: `profile`, `identity`, `facility`, `device`. */
  readonly entity: string;
  readonly texts?: string | FieldTexts;
}

/**
 * The check `itap.validate_custom_fields` makes, before any request: the shape always;
 * against the definitions once the field's input has loaded them; nothing for an existing
 * record whose value did not change (the trigger skips an update that leaves the column
 * as it was, so a new required attribute never blocks editing other columns).
 */
export function checkCustomFields(entity: string): FieldValidator {
  return problemValidator((value) => {
    if (!isPlainObject(value)) return NOT_OBJECT;
    const snapshot = customFieldsSnapshot(entity);
    if (snapshot === undefined) return null;
    if (snapshot.stored !== undefined && sameJson(value, snapshot.stored)) return null;
    return validateCustomFields(value, snapshot.definitions);
  });
}

/**
 * The organization's own attributes of a record, in its `custom_fields` jsonb column
 * (profiles, identities, facilities, devices). Input = one control per active
 * definition of `entity`, by sort order and data type, with values of inactive or
 * removed attributes kept as they are; display = label and value pairs. Required
 * attributes and value types are checked as the database checks them.
 */
export function customFields(opts: CustomFieldsOptions) {
  const base = f.json({
    // Not `required`: `{}` is a valid value; required attributes are checked per key.
    default: {},
    validate: checkCustomFields(opts.entity),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: CUSTOM_FIELDS_FIELD, display: CUSTOM_FIELDS_FIELD },
    meta: { entity: opts.entity },
  };
}
