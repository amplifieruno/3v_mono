import { z } from 'zod';
import { parseHasuraJwtSecret, type HasuraJwtSecret } from '../auth/hasuraJwt.js';

const envSchema = z.object({
  HASURA_GRAPHQL_URL: z.string().url(),
  GRAPHQL_ADMIN_SECRET: z.string().min(1),
  HASURA_JWT_SECRET: z.string().min(1).transform((raw, ctx): HasuraJwtSecret => {
    try {
      return parseHasuraJwtSecret(raw);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid HASURA_JWT_SECRET JSON' });
      return z.NEVER;
    }
  }),
  ACTION_SECRET: z.string().min(1),
  NHOST_STORAGE_URL: z.string().url(),
  SEED_PASSWORD: z.string().min(1).optional(),
  ORG_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
});

export type Env = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
