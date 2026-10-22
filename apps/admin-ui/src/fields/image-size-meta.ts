import { z } from 'zod';

/** The `meta` an `imageSize(...)` field carries (`./image-size.ts`). */
export const imageSizeMeta = z.object({
  axis: z.enum(['width', 'height']),
  imageField: z.string().min(1),
});

export type ImageSizeMeta = z.infer<typeof imageSizeMeta>;
