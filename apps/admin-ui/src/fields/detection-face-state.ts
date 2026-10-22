/** What a detection row says about the face it recorded. */
export type DetectionFaceState =
  | { readonly kind: 'photo'; readonly fileId: string; readonly isNew: boolean }
  | { readonly kind: 'erased' }
  | { readonly kind: 'unidentified' }
  | { readonly kind: 'none' };

const present = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

/**
 * The face of a detection row. A person erased on request keeps a tombstone profile
 * (`person_erased`, computed): erased, whatever the row still holds. Retention and erasure
 * anonymize a detection by clearing its identity, thumbnail and box; a face that created an
 * identity later deleted loses the identity too. A live face that was neither matched nor kept
 * still has its box: that is "unidentified".
 */
export function detectionFaceState(
  thumbnail: unknown,
  record: Readonly<Record<string, unknown>> | undefined,
): DetectionFaceState {
  const identity = record?.identity_id;
  const isNew = record?.is_new_identity === true;
  if (record?.person_erased === true) return { kind: 'erased' };
  if (typeof thumbnail === 'string' && thumbnail !== '') return { kind: 'photo', fileId: thumbnail, isNew };
  if (present(identity)) return { kind: 'none' };
  if (isNew || (record !== undefined && Object.hasOwn(record, 'bbox') && !present(record.bbox))) {
    return { kind: 'erased' };
  }
  return { kind: 'unidentified' };
}
