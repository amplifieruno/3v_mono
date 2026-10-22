import { fieldImplementation } from '@burojs/react';
import { SEGMENT_CONDITIONS_FIELD } from './segment-conditions';
import { SegmentConditionsDisplay } from './segment-conditions-display';
import { SegmentConditionsInput } from './segment-conditions-input';
import { segmentConditionsMeta } from './segment-conditions-meta';

/** The `itap.segment-conditions` input and display, for `composeFieldImplementations`. */
export const segmentConditionsImplementations = {
  [SEGMENT_CONDITIONS_FIELD]: fieldImplementation({
    meta: segmentConditionsMeta,
    Input: SegmentConditionsInput,
    Display: SegmentConditionsDisplay,
    layout: { size: 'full' },
  }),
};
