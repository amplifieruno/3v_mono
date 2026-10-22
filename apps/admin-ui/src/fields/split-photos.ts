import type { FieldTexts } from '@burojs/core';
import { f } from '@burojs/field-types';
import { problemValidator } from './field-issue';
import { validateSplitPhotos } from './split-photos-format';

/** The field implementation id of {@link splitPhotos} (`./split-photos-impl.ts`). */
export const SPLIT_PHOTOS_FIELD = 'itap.split-photos';

/**
 * The photos to split off an identity, chosen on their thumbnails, with the face template of each
 * (a photo and its template always move together). Start the value with the identity's id (the
 * form's `initial` reads the record); the value then holds a `SplitChoice`. A flow form field only;
 * no column stores it.
 */
export function splitPhotos(opts: { readonly texts?: string | FieldTexts } = {}) {
  const base = f.json({
    required: true,
    validate: problemValidator(validateSplitPhotos),
    ...(opts.texts === undefined ? {} : { texts: opts.texts }),
  });
  return { ...base, ui: { ...base.ui, input: SPLIT_PHOTOS_FIELD, display: SPLIT_PHOTOS_FIELD } };
}
