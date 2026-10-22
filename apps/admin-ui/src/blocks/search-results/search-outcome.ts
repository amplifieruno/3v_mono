/**
 * What a search's outcome says (Review Focus 1): a photo that could not be searched names why,
 * a photo with several faces says the largest was searched, and a search that found nobody says
 * so; never a bare empty list. Keys are the results block's texts (`./search-results-block.ts`).
 */

/** The reasons `search_faces` records on a failed request for its photo. */
export const PHOTO_FAILURES = ['no_face', 'low_quality', 'invalid_image'] as const;

export type PhotoFailure = (typeof PHOTO_FAILURES)[number];

export type SearchOutcomeKind =
  | { readonly kind: 'pending' }
  | { readonly kind: 'photo'; readonly reason: PhotoFailure }
  | { readonly kind: 'error'; readonly detail: string }
  | { readonly kind: 'none' }
  | { readonly kind: 'found'; readonly count: number };

export interface SearchOutcomeInput {
  readonly status: string;
  readonly error: string | null;
  readonly results_count: number;
}

const isPhotoFailure = (value: string | null): value is PhotoFailure =>
  value !== null && (PHOTO_FAILURES as readonly string[]).includes(value);

/** The outcome of a request as read: still running, the photo refused, failed, nobody, or found. */
export function searchOutcome(run: SearchOutcomeInput): SearchOutcomeKind {
  if (run.status === 'queued' || run.status === 'running') return { kind: 'pending' };
  if (run.status === 'failed') {
    return isPhotoFailure(run.error) ? { kind: 'photo', reason: run.error } : { kind: 'error', detail: run.error ?? '' };
  }
  return run.results_count === 0 ? { kind: 'none' } : { kind: 'found', count: run.results_count };
}

/** Whether the photo showed several faces, of which the largest was searched. */
export const severalFaces = (faceCount: number | null): boolean => faceCount !== null && faceCount > 1;

/** A similarity as a percentage with no decimals (`0.873` → `87%`). */
export const confidenceText = (confidence: number): string => `${Math.round(confidence * 100)}%`;

/** Whether a request as last read is still queued or running (the results block reads it again until not). */
export const searchPending = (run: { readonly status: string } | null | undefined): boolean =>
  run?.status === 'queued' || run?.status === 'running';
