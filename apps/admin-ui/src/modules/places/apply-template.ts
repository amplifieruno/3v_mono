import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { schema } from '../../data/schema';
import { PLACES_BINDING } from './occupancy';
import { AREA_RESOURCE } from '../../data/resource-names';

export const applyFacilityTemplateInput = z.object({
  templateId: z.string().uuid(),
  facilityId: z.string().uuid(),
  parentAreaId: z.string().uuid().nullable(),
});

/** One area row `apply_facility_template` returns (the created areas, pre-order). */
const createdArea = z.object({ id: z.string(), name: z.string(), parent_id: z.string().nullable() });

/**
 * What applying created, as the server answered it: every created area (`created`), the
 * top-level ones among them (`top_level`, the template's roots) and their names. The
 * function never skips a name that already exists, so nothing is ever reported as skipped.
 */
export const applyFacilityTemplateOutput = z.object({
  created: z.number(),
  top_level: z.number(),
  names: z.string(),
});

export type AppliedTemplate = z.infer<typeof applyFacilityTemplateOutput>;

/** The outcome of the created rows; the roots are those whose parent is not among them. */
export function summarizeApplied(rows: readonly z.infer<typeof createdArea>[]): AppliedTemplate {
  const ids = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => row.parent_id === null || !ids.has(row.parent_id));
  return {
    created: rows.length,
    top_level: roots.length,
    names: roots.map((row) => row.name).join(', '),
  };
}

/**
 * `apply_facility_template(hasura_session, p_template, p_facility, p_parent_area)`: creates the
 * template's area tree in the facility (under `p_parent_area`, else at the top) in one
 * transaction and returns the created areas. Hasura fills the session argument.
 */
export const applyFacilityTemplateOperation = hasuraOperation(
  PLACES_BINDING,
  'applyFacilityTemplate',
  {
    kind: 'mutation',
    document: `mutation ApplyFacilityTemplate($template: uuid!, $facility: uuid!, $parent: uuid) {
  apply_facility_template(
    args: { p_template: $template, p_facility: $facility, p_parent_area: $parent }
  ) {
    id
    name
    parent_id
  }
}`,
    variables: (input) => {
      const { templateId, facilityId, parentAreaId } = input as z.infer<
        typeof applyFacilityTemplateInput
      >;
      return { template: templateId, facility: facilityId, parent: parentAreaId ?? null };
    },
    mapResult: (data) => {
      const rows = z.array(createdArea).safeParse(rootOf(data, 'apply_facility_template'));
      return rows.success ? summarizeApplied(rows.data) : null;
    },
  },
);

/**
 * Applies a facility template (the tracked SQL function `apply_facility_template`): every area
 * of the template is created, even where an area of the same name already exists. The new
 * areas refresh every area read.
 */
export const applyFacilityTemplate = defineMutation('itap:apply-facility-template', {
  binding: applyFacilityTemplateOperation.binding,
  input: schema(applyFacilityTemplateInput),
  output: schema(applyFacilityTemplateOutput),
  // The area resource by name: the facility page (which imports this) is imported by `./area.ts`.
  effects: [{ resource: AREA_RESOURCE }],
});
