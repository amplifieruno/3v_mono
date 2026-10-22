import type { FieldProblem } from './field-issue';

/** The file ids of a face photos value; anything that is not a list of texts reads as none. */
export function facePhotoIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string' && id !== '') : [];
}

/**
 * `null` when `value` holds between `min` and `max` photos, else the problem (code
 * `facePhotos.<reason>`, params `min`, `max`, `count`). An empty list is left to `required`.
 */
export function validateFacePhotos(
  value: unknown,
  { min, max }: { readonly min: number; readonly max: number },
): FieldProblem | null {
  const count = facePhotoIds(value).length;
  if (count === 0) return null;
  if (count < min) {
    return { code: 'facePhotos.tooFew', text: `Add at least ${min} photos.`, params: { min, max, count } };
  }
  if (count > max) {
    return { code: 'facePhotos.tooMany', text: `Use at most ${max} photos; remove ${count - max}.`, params: { min, max, count, extra: count - max } };
  }
  return null;
}
