import { z } from 'zod';

/** The `meta` a `timeWindows(...)` field carries (`./time-windows.ts`). */
export const timeWindowsMeta = z.object({
  nullable: z.boolean(),
  /** What no windows means for the column (`Never on shift`, `Always open`). */
  emptyText: z.string(),
});

export type TimeWindowsMeta = z.infer<typeof timeWindowsMeta>;
