import { z } from 'zod';

/** The `meta` a `templateStructure()` field carries (`./template-structure.ts`): none. */
export const templateStructureMeta = z.object({});

export type TemplateStructureMeta = z.infer<typeof templateStructureMeta>;
