import { z } from 'zod';

/** The `meta` a `timezone(...)` field carries (`./timezone.ts`). */
export const timezoneMeta = z.object({
  /** The column allows `null`: the input offers Clear. */
  nullable: z.boolean(),
});

export type TimezoneMeta = z.infer<typeof timezoneMeta>;
