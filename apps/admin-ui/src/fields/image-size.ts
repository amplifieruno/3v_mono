import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { rangeValidator } from './bounded-number';

/** The field implementation id of {@link imageSize} (`./image-size-impl.ts`). */
export const IMAGE_SIZE_FIELD = 'itap.image-size';

export interface ImageSizeOptions {
  /** Which side of the image the column holds. */
  readonly axis: 'width' | 'height';
  /** The form field holding the image (a storage file id). */
  readonly imageField: string;
  readonly texts?: string | FieldTexts;
}

/**
 * A required whole number of pixels, at least 1, that the input fills from the image in
 * `imageField` when it is empty (`floor_plans.width_px` / `height_px`). When the image's own
 * size differs from the value (a replaced image), the input offers to take it over.
 */
export function imageSize(opts: ImageSizeOptions) {
  const base = f.number({
    required: true,
    integer: true,
    validate: rangeValidator({ min: 1, integer: true }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: IMAGE_SIZE_FIELD },
    meta: { axis: opts.axis, imageField: opts.imageField },
  };
}
