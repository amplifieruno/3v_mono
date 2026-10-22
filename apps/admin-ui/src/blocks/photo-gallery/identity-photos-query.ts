import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import { IDENTITY_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the photo gallery's operation is bound under. */
export const PHOTO_GALLERY_BINDING = 'photo-gallery';

/** Photos the gallery shows: the newest; the total says how many more there are. */
export const GALLERY_LIMIT = 60;

export const galleryPhoto = z.object({
  id: z.string(),
  file_id: z.string(),
  kind: z.string(),
  quality_score: z.number().nullable(),
  captured_at: z.string().nullable(),
  created_at: z.string(),
  device: z.object({ name: z.string() }).nullable(),
});

export const galleryPhotos = z.object({ total: z.number().int(), photos: z.array(galleryPhoto) });

export type GalleryPhoto = z.infer<typeof galleryPhoto>;
export type GalleryPhotos = z.infer<typeof galleryPhotos>;

/** Reads the newest photos of one identity with the capturing camera's name, and their count. */
export const identityPhotosOperation = hasuraOperation(PHOTO_GALLERY_BINDING, 'identityPhotos', {
  kind: 'query',
  document: `query IdentityPhotos($identity: uuid!, $limit: Int!) {
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
    device { name }
  }
  identity_photos_aggregate(where: { identity_id: { _eq: $identity } }) { aggregate { count } }
}`,
  variables: (input) => ({ identity: (input as { identityId: string }).identityId, limit: GALLERY_LIMIT }),
  mapResult: (data) => {
    const aggregate = rootOf(data, 'identity_photos_aggregate') as { aggregate?: { count?: unknown } } | undefined;
    return { total: Number(aggregate?.aggregate?.count ?? 0), photos: rootOf(data, 'identity_photos') ?? [] };
  },
});

/** The photos of one identity (`itap:photo-gallery`); refreshed by every write to identities. */
export const identityPhotos = defineQuery('itap:identity-photos', {
  binding: identityPhotosOperation.binding,
  input: schema(z.object({ identityId: z.string().uuid() })),
  output: schema(galleryPhotos),
  reads: [resourceByName(IDENTITY_RESOURCE)],
});
