import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateShape } from './plan-shape-check';
import { newPlanChannel, planSizeFor } from './plan-size-registry';

/** The field implementation id of {@link areaShape} (`./area-shape-impl.ts`). */
export const AREA_SHAPE_FIELD = 'itap.area-shape';

export interface AreaShapeOptions {
  /**
   * The form field naming the area the shape is drawn from (an area's `parent_id`, a device's
   * `area_id`); its floor plan, or its nearest enclosing area's, is the one to draw on.
   */
  readonly areaField: string;
  /**
   * The record is an area itself (`areas.shape`): its own floor plan comes before `areaField`'s,
   * and its stored shape is not repeated among the faint shapes. Default `false` (a device's
   * coverage).
   */
  readonly selfIsArea?: boolean;
  /** The form field holding the record's facility (`facility_id`). */
  readonly facilityField?: string;
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
 * An outline in floor-plan pixels, in a nullable `jsonb` column (`areas.shape`,
 * `devices.coverage`): a polygon or a circle (`./plan-geometry.ts`). The input draws it over
 * the floor plan found from `areaField` (with `selfIsArea`, the record's own plan first): that
 * area's plan or its nearest enclosing area's; the display is a small preview of the outline.
 */
export function areaShape(opts: AreaShapeOptions) {
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
      areaField: opts.areaField,
      selfIsArea: opts.selfIsArea ?? false,
    },
  };
}
