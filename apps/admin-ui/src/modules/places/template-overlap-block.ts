import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * Sits in the facility's "Apply template" form: previews the chosen template's areas and
 * warns, before anything is sent, when an area under the chosen parent (or at the facility's
 * top level) already has the name of one of the template's top-level areas. The database
 * function creates every area of the template anyway (names are not unique), so applying a
 * template twice doubles it; this is where the user sees that. A flow check cannot read a
 * list keyed by the chosen values (`tasks/ui/buro-gaps.md` G18), so the block reads them.
 */
export const templateOverlapBlock = defineBlock('itap:template-overlap', {
  texts: {
    label: 'Template preview',
    pick: 'Choose a template to see the areas it creates.',
    creates: 'Creates {{count}} areas:',
    overlap:
      'Already here: {{names}}. Applying adds a second area with each of these names; existing areas are not skipped or merged.',
    loading: 'Reading the template…',
  },
  props: {
    // Set by the placement: a flow form has no record to default to.
    facilityId: prop(z.string().nullable().optional()).default(null),
    templateId: prop(z.string().nullable().optional()).default(ref('values', 'template_id')),
    parentId: prop(z.string().nullable().optional()).default(ref('values', 'parent_area_id')),
  },
});
