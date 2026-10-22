import { z } from 'zod';

/** The `meta` a `timeWindows(...)` field carries (`./time-windows.ts`). */
export const timeWindowsMeta = z.object({ nullable: z.boolean() });

export type TimeWindowsMeta = z.infer<typeof timeWindowsMeta>;
