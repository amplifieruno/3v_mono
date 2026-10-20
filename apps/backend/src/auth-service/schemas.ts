import { z } from 'zod';
import { ServiceError } from './errors.js';

/** Request bodies of /v1/auth/* (documented in openapi.ts; FS AuthenticationRequest extended per SA_6 §3.8). */

export const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_TIMEOUT_MS = 10_000;

export const openSessionSchema = z
  .object({
    mode: z.enum(['identification', 'verification']),
    claimed_identity_id: z.string().min(1).max(200).optional(),
    access_point_id: z.string().uuid().optional(),
    device_ref: z.string().trim().min(1).max(128),
  })
  .strict();

const captureFields = {
  frames: z.array(z.string().min(1)).min(1).max(10),
  binding: z.string().regex(/^[0-9a-fA-F]{64}$/, 'binding must be a hex HMAC-SHA256'),
  claimed_identity_id: z.string().min(1).max(200).optional(),
  threshold: z.number().min(0).max(1).optional(),
  timeout_ms: z.number().int().min(100).max(MAX_TIMEOUT_MS).optional(),
};

export const authenticateSchema = z.object({ session_id: z.string().uuid(), ...captureFields }).strict();
export const recaptureSchema = z.object(captureFields).strict();

export const secondFactorSchema = z
  .object({ result: z.enum(['passed', 'failed']), method: z.string().trim().min(1).max(64) })
  .strict();

export type CaptureBody = z.output<typeof recaptureSchema>;

/** Parses a raw JSON body with a schema; any problem is a 400 invalid_request naming the first issue. */
export function parseBody<S extends z.ZodTypeAny>(schema: S, raw: Buffer): z.output<S> {
  let value: unknown;
  try {
    value = raw.length === 0 ? {} : JSON.parse(raw.toString('utf8'));
  } catch {
    throw new ServiceError(400, 'invalid_request', 'The body is not valid JSON');
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ServiceError(400, 'invalid_request', `${issue.path.join('.') || 'body'}: ${issue.message}`);
  }
  return parsed.data;
}

export const isUuid = (value: string) => z.string().uuid().safeParse(value).success;
