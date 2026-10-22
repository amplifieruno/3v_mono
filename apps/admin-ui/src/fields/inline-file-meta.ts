import { z } from 'zod';

/** The `meta` an `inlineFile(...)` field carries (`./inline-file.ts`). */
export const inlineFileMeta = z.object({
  accept: z.string().min(1),
  maxSize: z.number().positive(),
});

export type InlineFileMeta = z.infer<typeof inlineFileMeta>;
