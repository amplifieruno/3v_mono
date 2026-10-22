import { fieldImplementation } from '@burojs/react';
import { FACE_PHOTOS_FIELD } from './face-photos';
import { FacePhotosDisplay } from './face-photos-display';
import { FacePhotosInput } from './face-photos-input';
import { facePhotosMeta } from './face-photos-meta';

/** The `itap.face-photos` input and display, for `composeFieldImplementations`. */
export const facePhotosImplementations = {
  [FACE_PHOTOS_FIELD]: fieldImplementation({
    meta: facePhotosMeta,
    Input: FacePhotosInput,
    Display: FacePhotosDisplay,
  }),
};
