import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateTemplateStructure } from './template-structure-format';

/** The field implementation id of {@link templateStructure} (`./template-structure-impl.ts`). */
export const TEMPLATE_STRUCTURE_FIELD = 'itap.template-structure';

export interface TemplateStructureOptions {
  readonly texts?: string | FieldTexts;
}

/** {@link validateTemplateStructure} as a field validator: a translatable issue on the field. */
export function checkTemplateStructure(): FieldValidator {
  return problemValidator(validateTemplateStructure);
}

/**
 * The area tree of a facility template in a `jsonb` column. Input = the kit's JSON editor
 * (checked as the database checks it); display = a read-only tree preview of the areas the
 * template creates, with type, access level and capacity.
 */
export function templateStructure(opts: TemplateStructureOptions = {}) {
  const jsonOpts: JsonFieldOpts = {
    required: true,
    validate: checkTemplateStructure(),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  };
  const base = f.json(jsonOpts);
  return {
    ...base,
    ui: { ...base.ui, display: TEMPLATE_STRUCTURE_FIELD },
    meta: {},
  };
}
