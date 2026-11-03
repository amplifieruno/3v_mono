import { z } from 'zod';

/** The `meta` a `secret(...)` field carries (`./secret.ts`). */
export const secretMeta = z.object({
  /** Never selected: the Hasura mapping leaves the column out of every read. */
  writeOnly: z.literal(true),
});

export type SecretMeta = z.infer<typeof secretMeta>;
