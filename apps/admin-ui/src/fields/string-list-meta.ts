import { z } from 'zod';

/** The `meta` a `stringList(...)` field carries (`./string-list.ts`). */
export const stringListMeta = z.object({
  /** The column allows `null`: removing the last row writes `null`, else `[]`. */
  nullable: z.boolean(),
  /** How one entry is named on the add/remove buttons and row labels (`Option`). */
  item: z.string(),
});

export type StringListMeta = z.infer<typeof stringListMeta>;
