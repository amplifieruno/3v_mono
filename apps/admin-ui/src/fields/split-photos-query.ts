import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../data/operations';
import { resourceByName } from '../data/resource-by-name';
import { IDENTITY_RESOURCE } from '../data/resource-names';
import { schema } from '../data/schema';

/** The registry key the split choice's operation is bound under. */
export const SPLIT_PHOTOS_BINDING = 'split-photos';

/** Photos offered for a split: the newest, as the gallery shows them. */
export const SPLIT_PHOTOS_LIMIT = 60;

const splitPhoto = z.object({
  id: z.string(),
  file_id: z.string(),
  kind: z.string(),
  quality_score: z.number().nullable(),
  captured_at: z.string().nullable(),
  created_at: z.string(),
});

export const splitParts = z.object({
  photos: z.array(splitPhoto),
  /** Each face template with the photo file it was computed from. */
  templates: z.array(z.object({ id: z.string(), photo_file_id: z.string().nullable() })),
});

export type SplitParts = z.infer<typeof splitParts>;

export const splitPartsOperation = hasuraOperation(SPLIT_PHOTOS_BINDING, 'splitParts', {
  kind: 'query',
  document: `query SplitParts($identity: uuid!, $limit: Int!) {
  identity_photos(
    where: { identity_id: { _eq: $identity } }
    order_by: [{ captured_at: desc_nulls_last }, { created_at: desc }]
    limit: $limit
  ) {
    id
    file_id
    kind
    quality_score
    captured_at
    created_at
  }
  identity_embeddings(where: { identity_id: { _eq: $identity } }) {
    id
    photo_file_id
  }
}`,
  variables: (input) => ({ identity: (input as { identityId: string }).identityId, limit: SPLIT_PHOTOS_LIMIT }),
  mapResult: (data) => ({
    photos: rootOf(data, 'identity_photos') ?? [],
    templates: rootOf(data, 'identity_embeddings') ?? [],
  }),
});

/** An identity's photos and face templates, for choosing what a split moves. */
export const identitySplitParts = defineQuery('itap:identity-split-parts', {
  binding: splitPartsOperation.binding,
  input: schema(z.object({ identityId: z.string().uuid() })),
  output: schema(splitParts),
  reads: [resourceByName(IDENTITY_RESOURCE)],
});

/** The templates computed from the chosen photos' files: they move with the photos. */
export function templatesOf(parts: SplitParts, fileIds: readonly string[]): string[] {
  const files = new Set(fileIds);
  return parts.templates.flatMap((t) => (t.photo_file_id !== null && files.has(t.photo_file_id) ? [t.id] : []));
}
