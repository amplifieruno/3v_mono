import type { FieldTexts } from '@burojs/core';
import { type FieldValidator, f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateFacePhotos } from './face-photos-format';

/** The field implementation id of {@link facePhotos} (`./face-photos-impl.ts`). */
export const FACE_PHOTOS_FIELD = 'itap.face-photos';

/**
 * `storage.files.metadata.kind` of a face photo given to an enrollment action: an ordinary
 * organization file (not sensitive, not owner-only), which the actions read and crop. The
 * platform stores its own crop of each accepted face (`identity_photo`).
 */
export const FACE_SOURCE_KIND = 'face_source';

/** The formats the actions decode, as HTML `accept` tokens. */
export const FACE_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp';

/** Largest photo the actions read (`MAX_PHOTO_BYTES` in the backend). */
export const FACE_PHOTO_MAX_BYTES = 15 * 1024 * 1024;

export interface FacePhotosOptions {
  /** Fewest photos the form accepts (1 for enrollment). */
  readonly min: number;
  /** Most photos the form accepts (the actions take up to 10; the console asks for at most 5). */
  readonly max: number;
  /** `storage.files.metadata.kind` of the uploads; {@link FACE_SOURCE_KIND} by default (a search photo is `search`). */
  readonly kind?: string;
  readonly texts?: string | FieldTexts;
}

/** {@link validateFacePhotos} as a field validator: a translatable issue on the field. */
export function checkFacePhotos(min: number, max: number): FieldValidator {
  return problemValidator((value) => validateFacePhotos(value, { min, max }));
}

/**
 * Face photos for an enrollment action: a list of organization file ids. The input uploads each
 * picked or camera-captured photo at once (kind {@link FACE_SOURCE_KIND}) and keeps its id; the
 * action then checks every photo server side (one face, quality, duplicates) and answers which
 * it refused and why. The value lives in a flow form only; no column stores it.
 */
export function facePhotos(opts: FacePhotosOptions) {
  const base = f.json({
    required: true,
    default: [],
    validate: checkFacePhotos(opts.min, opts.max),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return {
    ...base,
    ui: { ...base.ui, input: FACE_PHOTOS_FIELD, display: FACE_PHOTOS_FIELD },
    meta: { min: opts.min, max: opts.max, kind: opts.kind ?? FACE_SOURCE_KIND, accept: FACE_PHOTO_ACCEPT, maxSize: FACE_PHOTO_MAX_BYTES },
  };
}
