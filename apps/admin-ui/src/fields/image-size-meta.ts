import { z } from 'zod';

/** The `meta` an `imageSize(...)` field carries (`./image-size.ts`). */
export const imageSizeMeta = z.object({
  /** The form values the input reads: buro hands a field only what its refs name. */
  reads: z.array(z.unknown()).optional(),
  axis: z.enum(['width', 'height']),
  imageField: z.string().min(1),
});

export type ImageSizeMeta = z.infer<typeof imageSizeMeta>;
