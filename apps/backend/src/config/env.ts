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
  // The backend as Hasura and the backend container reach it (compose service name); the seed points its webhook
  // subscription at the dev sink under it.
  BACKEND_URL: z.string().url().default('http://backend:3001'),
  ORG_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  // Live camera recognition (src/recognition) runs in the server process unless set to 'false'.
  RECOGNITION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() !== 'false'),
  // Recognition request limits: a hung InsightFace or Hasura call fails the frame (lastError) instead of stalling it.
  RECOGNITION_INSIGHTFACE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  RECOGNITION_HASURA_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  // Face authentication service (/v1/auth/*): 32-byte key (64 hex) encrypting client key secrets at rest and deriving
  // session nonces. Unset: the keyed routes answer 503 service_not_configured and rotate_client_key refuses.
  AUTH_KEY_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'AUTH_KEY_ENCRYPTION_KEY must be 64 hex characters')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  // hasura-storage per-request limit (connect + body read): a hung upload/download fails instead of stalling.
  STORAGE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  // Dev/test webhook receiver at /hasura/events/webhook-sink (src/webhooks/sink.ts); only the exact value 'true'
  // enables it (dev compose), never in production.
  WEBHOOK_SINK_ENABLED: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true'),
  // Webhook targets on loopback / private networks (10/8, 172.16/12, 192.168/16, fc00::/7) are allowed only when
  // 'true' (dev: the sink is http://backend:3001). Link-local / metadata addresses are always refused.
  WEBHOOK_ALLOW_PRIVATE_TARGETS: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() === 'true'),
});

export type Env = z.output<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return envSchema.parse(source);
}
