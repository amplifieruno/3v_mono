import { fieldImplementation } from '@burojs/react';
import { IMAGE_SIZE_FIELD } from './image-size';
import { ImageSizeInput } from './image-size-input';
import { imageSizeMeta } from './image-size-meta';

/** The `itap.image-size` input (the display is the kit's number display). */
export const imageSizeImplementations = {
  [IMAGE_SIZE_FIELD]: fieldImplementation({
    meta: imageSizeMeta,
    Input: ImageSizeInput,
  }),
};
