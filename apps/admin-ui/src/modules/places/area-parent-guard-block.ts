import { defineBlock, prop, ref } from '@burojs/core';
import { z } from 'zod';

/**
 * Sits under the area form's parent field: says at once when the chosen parent is the area
 * itself or one of its own sub-areas, a move the database refuses (`area_cycle`). The record
 * form cannot show that refusal on the field (`tasks/ui/buro-gaps.md` G14), and no check can
 * read the chosen parent's row or test membership in its path (G18), so this block reads it and
 * compares its path with the area's id. Nothing is shown on create (a new area is nobody's
 * ancestor) or while the parent is empty.
 */
export const areaParentGuardBlock = defineBlock('itap:area-parent-guard', {
  texts: {
    label: 'Parent check',
    self: 'An area cannot be inside itself. Choose another area, or none.',
    descendant:
      '“{{parent}}” is inside this area. An area cannot be moved under one of its own sub-areas; choose an area outside it, or none.',
  },
  props: {
    areaId: prop(z.string().nullable().optional()).default(ref('record', 'id')),
    parentId: prop(z.string().nullable().optional()).default(ref('values', 'parent_id')),
  },
});
