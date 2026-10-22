import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, type JsonFieldOpts, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validatePlanPoint } from './plan-shape-check';
import { newPlanChannel, planSizeFor } from './plan-size-registry';

/** The field implementation id of {@link planPosition} (`./plan-position-impl.ts`). */
export const PLAN_POSITION_FIELD = 'itap.plan-position';

export interface PlanPositionOptions {
  /** The form field naming the area the record sits in; its floor plan is the one to click on. */
  readonly areaField: string;
  /** The form field holding the record's facility (`facility_id`). */
  readonly facilityField?: string;
  readonly texts?: string | FieldTexts;
}

/** {@link validatePlanPoint} as a field validator; bounds once the mounted input published them. */
export function checkPlanPosition(channel: string): FieldValidator {
  return problemValidator((value) => validatePlanPoint(value, planSizeFor(channel)));
}

/**
 * A point `[x, y]` in floor-plan pixels, in a nullable `jsonb` column (`access_points.position`,
 * `devices.position`). The input places it with a click on the floor plan of the area named by
 * `areaField` (that area's plan or its nearest enclosing area's); the display shows the
 * coordinates.
 */
export function planPosition(opts: PlanPositionOptions) {
  const channel = newPlanChannel('planPosition');
  const jsonOpts: JsonFieldOpts = {
    nullable: true,
    validate: checkPlanPosition(channel),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  };
  const base = f.json(jsonOpts);
  return {
    ...base,
    ui: { ...base.ui, input: PLAN_POSITION_FIELD, display: PLAN_POSITION_FIELD },
    meta: {
      channel,
      areaField: opts.areaField,
      facilityField: opts.facilityField ?? 'facility_id',
    },
  };
}
