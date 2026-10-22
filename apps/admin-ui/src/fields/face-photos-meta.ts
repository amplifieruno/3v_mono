import { z } from 'zod';

/** The `meta` a `facePhotos(...)` field carries (`./face-photos.ts`). */
export const facePhotosMeta = z.object({
  min: z.number().int().positive(),
  max: z.number().int().positive(),
  /** `storage.files.metadata.kind` of the uploaded photos. */
  kind: z.string().min(1),
  accept: z.string().min(1),
  maxSize: z.number().positive(),
});

export type FacePhotosMeta = z.infer<typeof facePhotosMeta>;
