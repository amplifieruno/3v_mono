import type { FieldProblem } from './field-issue';

/** What a split takes: the identity, the chosen photos (with their files) and their face templates. */
export interface SplitChoice {
  readonly identityId: string;
  readonly photos: readonly { readonly id: string; readonly fileId: string }[];
  readonly embeddingIds: readonly string[];
}

/**
 * The split choice a value holds. The flow's form starts the value as the identity's id (its
 * `initial` reads the record), so the input knows whose photos to offer; choosing photos turns
 * it into a {@link SplitChoice}. Anything else reads as no identity.
 */
export function splitChoiceOf(value: unknown): SplitChoice {
  if (typeof value === 'string') return { identityId: value, photos: [], embeddingIds: [] };
  const v = (value ?? {}) as Partial<Record<keyof SplitChoice, unknown>>;
  const photos = Array.isArray(v.photos)
    ? v.photos.filter(
        (p): p is { id: string; fileId: string } =>
          typeof (p as { id?: unknown } | null)?.id === 'string' && typeof (p as { fileId?: unknown }).fileId === 'string',
      )
    : [];
  const embeddingIds = Array.isArray(v.embeddingIds)
    ? v.embeddingIds.filter((id): id is string => typeof id === 'string')
    : [];
  return { identityId: typeof v.identityId === 'string' ? v.identityId : '', photos, embeddingIds };
}

/** `null` when at least one photo is chosen, else the problem (`splitPhotos.none`). */
export function validateSplitPhotos(value: unknown): FieldProblem | null {
  return splitChoiceOf(value).photos.length > 0
    ? null
    : { code: 'splitPhotos.none', text: 'Choose at least one photo to split off.' };
}
