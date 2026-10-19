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
  INSIGHTFACE_API_URL: z.string().url(),
  STREAM_SERVER_URL: z.string().url().default('http://stream-server:8888'),
  SEED_PASSWORD: z.string().min(1).optional(),
  ORG_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Live camera recognition (src/recognition) runs in the server process unless set to 'false'.
  RECOGNITION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() !== 'false'),
  // Recognition request limits: a hung InsightFace or Hasura call fails the frame (lastError) instead of stalling it.
  RECOGNITION_INSIGHTFACE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RECOGNITION_HASURA_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // hasura-storage per-request limit (connect + body read): a hung upload/download fails instead of stalling.
  STORAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Dev/test webhook receiver at /hasura/events/webhook-sink (src/webhooks/sink.ts); only the exact value 'true'
  // enables it (dev compose), never in production.
  WEBHOOK_SINK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true'),
});

export type Env = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
