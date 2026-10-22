import { z } from 'zod';

/** The `meta` a `customFields(...)` field carries (`./custom-fields.ts`). */
export const customFieldsMeta = z.object({
  /** The `custom_attribute_entities` value whose definitions apply (`facility`, `profile`, …). */
  entity: z.string().min(1),
});

export type CustomFieldsMeta = z.infer<typeof customFieldsMeta>;
