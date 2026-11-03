import { z } from 'zod';

/** The `meta` an `areaShape(...)` field carries (`./area-shape.ts`). */
export const areaShapeMeta = z.object({
  /** The form values the input reads: buro hands a field only what its refs name. */
  reads: z.array(z.unknown()).optional(),
  /** Where the input publishes the plan size its validator reads (`./plan-size-registry.ts`). */
  channel: z.string().min(1),
  facilityField: z.string().min(1),
  areaField: z.string().min(1),
  /** The record is itself an area: its own floor plan comes first, its own shape is not drawn faintly. */
  selfIsArea: z.boolean(),
});

export type AreaShapeMeta = z.infer<typeof areaShapeMeta>;
