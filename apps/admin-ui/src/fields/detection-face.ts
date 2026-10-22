import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';

/** The field implementation id of {@link detectionFace} (`./detection-face-impl.ts`). */
export const DETECTION_FACE_FIELD = 'itap.detection-face';

/**
 * A detection's `thumbnail_file_id` shown as the face the camera saw, with what became of it:
 * "New identity" for a face that created one, "Unidentified" for a face neither matched nor
 * kept, "Erased" when the person's data was erased or anonymized (the linked profile is an erased
 * tombstone, the row lost its identity and its box, or the photo file is gone) instead of a broken
 * picture (plan 05 Review Focus 3). The display reads `identity_id`, `is_new_identity`, `bbox` and
 * `person_erased` of the same row. Never written.
 */
export function detectionFace(opts: { readonly texts?: FieldTexts; readonly in?: readonly ('list' | 'show')[] } = {}) {
  const base = f.uuid({
    nullable: true,
    system: true,
    ...(opts.in === undefined ? {} : { in: opts.in }),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, display: DETECTION_FACE_FIELD }, meta: {} };
}
