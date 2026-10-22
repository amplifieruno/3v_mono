import { z } from 'zod';

/** The `meta` a `planPosition(...)` field carries (`./plan-position.ts`). */
export const planPositionMeta = z.object({
  /** Where the input publishes the plan size its validator reads (`./plan-size-registry.ts`). */
  channel: z.string().min(1),
  areaField: z.string().min(1),
  facilityField: z.string().min(1),
});

export type PlanPositionMeta = z.infer<typeof planPositionMeta>;
