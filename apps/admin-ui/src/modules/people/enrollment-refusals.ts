import type { ActionRefusalReader, RefusalIssue } from '../../data/action-refusals';

/**
 * Why the platform refused one photo (`RejectReason` of the backend's enrollment steps), as the
 * console says it. Shared by the refusal of a whole request and the result of a partial one.
 */
export const PHOTO_REJECT_REASONS: Readonly<Record<string, string>> = {
  no_face: 'no face found',
  multiple_faces: 'more than one face; use a photo of the person alone',
  low_quality: 'the face is too small, blurred, dark or turned away',
  invalid_image: 'not a readable image',
  conflicting_identity: 'the face matches another identity (merge the two if they are the same person)',
};

/** The sentence for a reject reason; an unknown reason is shown as given. */
export const rejectReasonText = (reason: string): string => PHOTO_REJECT_REASONS[reason] ?? reason;

/** The file ids an enrollment input carries, in the order the form listed them. */
function fileIdsOf(input: unknown): string[] {
  const ids = (input as { readonly fileIds?: unknown } | null)?.fileIds;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string').map((id) => id.toLowerCase()) : [];
}

const UUID_REASON = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):\s*([a-z_]+)/gi;

/**
 * "Photo 2: no face found." per refused photo of a `no_valid_photos` message, which lists
 * `<file id>: <reason>` pairs; the number is the photo's place in the form.
 */
export function rejectedPhotoLines(message: string, fileIds: readonly string[]): string[] {
  return [...message.matchAll(UUID_REASON)].map(([, id = '', reason = '']) => {
    const index = fileIds.indexOf(id.toLowerCase());
    const name = index >= 0 ? `Photo ${index + 1}` : 'A photo';
    return `${name}: ${rejectReasonText(reason)}.`;
  });
}

const photos = (code: string, message: string): RefusalIssue => ({ code, message, path: ['fileIds'] });
const form = (code: string, message: string): RefusalIssue => ({ code, message, path: [] });

/** What each enrollment refusal tells the user; `duplicate_identity` depends on the action. */
function refusalIssue(code: string, message: string, fileIds: readonly string[], duplicate: string): RefusalIssue | null {
  switch (code) {
    case 'no_valid_photos':
      return photos(code, ['No photo shows a usable face, so nothing was saved.', ...rejectedPhotoLines(message, fileIds)].join(' '));
    case 'duplicate_identity':
      return photos(code, duplicate.replace('{{code}}', message));
    case 'subject_restricted':
      return photos(
        code,
        'The face belongs to a person whose processing is restricted or who withdrew biometric consent: no photo was added.',
      );
    case 'consent_withdrawn':
      return form(code, 'The person withdrew biometric consent, so no new face data can be stored. Nothing was saved.');
    case 'file_not_found':
      return photos(code, 'A photo could not be found any more. Remove it, upload it again and retry.');
    case 'invalid_input':
      return photos(code, `The request was refused: ${message}`);
    case 'profile_not_found':
      return form(code, 'The profile no longer exists.');
    case 'identity_not_found':
      return form(code, 'The identity no longer exists.');
    case 'identity_not_active':
      return form(code, 'The identity is merged or archived: photos cannot be added to it. Nothing was saved.');
    // Raised after Enroll face may already have linked the identity to the profile: no claim
    // that nothing changed (the backend's atomicity is a filed issue).
    case 'identity_merged_frozen':
      return form(code, 'The identity is merged or archived: no photo was added to it.');
    case 'identity_matching_disabled':
      return form(code, 'Matching is off for this identity (biometric consent withdrawn): no photo was added.');
    case 'identity_conflict':
      return form(code, 'The matching identity changed while the photos were checked. Nothing was saved; try again.');
    default:
      return null;
  }
}

/**
 * The refusal reader of one enrollment action (`../../data/action-refusals.ts`): every code the
 * backend's enrollment answers before it writes, on the photos field when it concerns the
 * photos, else on the form. `duplicate` is the sentence for `duplicate_identity`, whose message
 * is the existing identity's code (`{{code}}`).
 */
export function enrollmentRefusals(duplicate: string): ActionRefusalReader {
  return ({ code, message }, input) => {
    const issue = refusalIssue(code, message, fileIdsOf(input), duplicate);
    return issue === null ? null : [issue];
  };
}
