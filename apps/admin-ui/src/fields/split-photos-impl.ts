import { fieldImplementation } from '@burojs/react';
import { z } from 'zod';
import { SPLIT_PHOTOS_FIELD } from './split-photos';
import { SplitPhotosDisplay } from './split-photos-display';
import { SplitPhotosInput } from './split-photos-input';

/** The `itap.split-photos` input and display, for `composeFieldImplementations`. */
export const splitPhotosImplementations = {
  [SPLIT_PHOTOS_FIELD]: fieldImplementation({
    meta: z.object({}),
    Input: SplitPhotosInput,
    Display: SplitPhotosDisplay,
  }),
};
