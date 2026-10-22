import { fieldImplementation } from '@burojs/react';
import { AREA_SHAPE_FIELD } from './area-shape';
import { AreaShapeDisplay } from './area-shape-display';
import { AreaShapeInput } from './area-shape-input';
import { areaShapeMeta } from './area-shape-meta';

/** The `itap.area-shape` input and display, for `composeFieldImplementations`. */
export const areaShapeImplementations = {
  [AREA_SHAPE_FIELD]: fieldImplementation({
    meta: areaShapeMeta,
    Input: AreaShapeInput,
    Display: AreaShapeDisplay,
  }),
};
