import { fieldImplementation } from '@burojs/react';
import { PLAN_POSITION_FIELD } from './plan-position';
import { PlanPositionDisplay } from './plan-position-display';
import { PlanPositionInput } from './plan-position-input';
import { planPositionMeta } from './plan-position-meta';

/** The `itap.plan-position` input and display, for `composeFieldImplementations`. */
export const planPositionImplementations = {
  [PLAN_POSITION_FIELD]: fieldImplementation({
    meta: planPositionMeta,
    Input: PlanPositionInput,
    Display: PlanPositionDisplay,
  }),
};
