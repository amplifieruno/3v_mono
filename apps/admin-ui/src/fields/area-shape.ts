import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateShape } from './plan-shape-check';
import { newPlanChannel, planSizeFor } from './plan-size-registry';

/** The field implementation id of {@link areaShape} (`./area-shape-impl.ts`). */
export const AREA_SHAPE_FIELD = 'itap.area-shape';

export interface AreaShapeOptions {
  /** The form field holding the area's facility (`facility_id`). */
  readonly facilityField?: string;
  /** The form field holding the enclosing area (`parent_id`). */
  readonly parentField?: string;
  readonly texts?: string | FieldTexts;
}

/**
 * {@link validateShape} as a field validator: the structure always, the floor-plan bounds once
 * the mounted input has published the plan's size on `channel`.
 */
export function checkAreaShape(channel: string): FieldValidator {
  return problemValidator((value) => validateShape(value, planSizeFor(channel)));
}

/**
 * An area's outline in floor-plan pixels, in a nullable `jsonb` column (`areas.shape`): a
 * polygon or a circle (`./plan-geometry.ts`). The input draws it over the floor plan the area
 * lies on (the plan of the area itself or of its nearest enclosing area that has one); the
 * display is a small preview of the outline.
 */
export function areaShape(opts: AreaShapeOptions = {}) {
  const channel = newPlanChannel('areaShape');
  const jsonOpts: JsonFieldOpts = {
    nullable: true,
    validate: checkAreaShape(channel),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  };
  const base = f.json(jsonOpts);
  return {
    ...base,
    ui: { ...base.ui, input: AREA_SHAPE_FIELD, display: AREA_SHAPE_FIELD },
    meta: {
      channel,
      facilityField: opts.facilityField ?? 'facility_id',
      parentField: opts.parentField ?? 'parent_id',
    },
  };
}
