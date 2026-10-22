import { fieldImplementation } from '@burojs/react';
import { TEMPLATE_STRUCTURE_FIELD } from './template-structure';
import { TemplateStructureDisplay } from './template-structure-display';
import { templateStructureMeta } from './template-structure-meta';

/** The `itap.template-structure` display (the input is the kit's JSON editor). */
export const templateStructureImplementations = {
  [TEMPLATE_STRUCTURE_FIELD]: fieldImplementation({
    meta: templateStructureMeta,
    Display: TemplateStructureDisplay,
  }),
};
