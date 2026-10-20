import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { claimedRef, encryptSecret, generateClientKey, hashSecret, serverKeys, sha256Hex } from '../auth-service/crypto.js';
import { ServiceError, serviceErrorFromSql } from '../auth-service/errors.js';
import { fromFrames, MAX_FRAMES, MIN_FRAMES } from '../auth-service/frames.js';
import { runAuthentication } from '../auth-service/pipeline.js';
import { authenticationResponse } from '../auth-service/response.js';
import { createAuthServiceDeps } from '../auth-service/service.js';
import { HasuraError } from '../hasura/client.js';
import { OWNER_ONLY_FILE_KINDS } from '../storage/storageClient.js';
import { ActionError, defineAction, type ActionContext } from './types.js';

const STORE_KEY = `
  mutation RotateClientKey($args: store_client_key_args!) {
    store_client_key(args: $args) { id application_id key_prefix expires_at }
  }
`;
const FILES = `
  query AuthConsoleFiles($ids: [uuid!]!) { files(where: { id: { _in: $ids } }) { id bucketId metadata uploadedByUserId } }
`;

function organizationOf(ctx: ActionContext<unknown>): string {
  const org = ctx.session.organizationId?.toLowerCase();
  if (!org) throw new ActionError('no_organization', 'An organization session is required');
  return org;
}

function sqlCode(error: unknown): string | undefined {
  if (!(error instanceof HasuraError)) return undefined;
  return /\b(client_[a-z_]+|auth_[a-z_]+|access_point_not_bound)\b/.exec(`${error.detail ?? ''} ${error.message}`)?.[1];
}

/**
 * rotate_client_key(application_id, expires_at?) (org_admin): a new key for the application — prefix and secret
 * generated here, the secret returned in plaintext exactly once; stored as scrypt hash + AES-256-GCM ciphertext.
 * The previous key stays valid (at most two active keys: rotation overlap) until revoked with revoke_client_key.
 */
export const rotateClientKey = defineAction(
  z.object({ application_id: z.string().uuid(), expires_at: z.string().datetime({ offset: true }).nullish() }),
  async (ctx) => {
    organizationOf(ctx);
    if (ctx.session.role !== 'org_admin') throw new ActionError('forbidden', 'Only an organization admin can rotate keys');
    if (!ctx.env.AUTH_KEY_ENCRYPTION_KEY) throw new ActionError('auth_service_not_configured', 'AUTH_KEY_ENCRYPTION_KEY is not set');
    const keys = serverKeys(ctx.env.AUTH_KEY_ENCRYPTION_KEY);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { prefix, secret } = generateClientKey();
      try {
        const data = await ctx.actor.request<{ store_client_key: { id: string; application_id: string; key_prefix: string; expires_at: string | null }[] }>(
          STORE_KEY,
          {
            args: {
              p_application: ctx.input.application_id,
              p_key_prefix: prefix,
              p_secret_hash: hashSecret(secret),
              p_secret: encryptSecret(keys, secret),
              p_expires_at: ctx.input.expires_at ?? null,
            },
          },
        );
        const row = data.store_client_key[0];
        return { key_id: row.id, application_id: row.application_id, prefix: row.key_prefix, secret, expires_at: row.expires_at };
      } catch (error: unknown) {
        const text = error instanceof HasuraError ? `${error.detail ?? ''} ${error.message}` : '';
        if (text.includes('client_application_keys_key_prefix_key')) continue;
        const code = sqlCode(error);
        if (code) throw new ActionError(code, code.replace(/_/g, ' '));
        throw error;
      }
    }
    throw new ActionError('client_key_prefix_conflict', 'Could not allocate a unique key prefix; retry');
  },
);

const authenticateInput = z.object({
  application_id: z.string().uuid(),
  file_ids: z.array(z.string().uuid()).min(MIN_FRAMES).max(MAX_FRAMES),
  mode: z.enum(['identification', 'verification']),
  claimed_identity_id: z.string().min(1).max(200).nullish(),
  access_point_id: z.string().uuid().nullish(),
  threshold: z.number().min(0).max(1).nullish(),
});

type FileRow = { id: string; bucketId: string; metadata: { kind?: unknown } | null; uploadedByUserId: string | null };

/**
 * authenticate_face (org_admin console test): the same pipeline as POST /v1/auth/authenticate over 3–5 stored files
 * of the organization, under a new console session (device_ref `console:<user>`), recorded like any attempt. The
 * session binding does not apply (no client key); the attack outcome comes from the real sequence checks only.
 */
export const authenticateFace = defineAction(authenticateInput, async (ctx) => {
  const org = organizationOf(ctx);
  const input = ctx.input;
  const startedAt = Date.now();
  const deps = createAuthServiceDeps(ctx.env);
  const { files } = await ctx.admin.request<{ files: FileRow[] }>(FILES, { ids: input.file_ids });
  const byId = new Map(files.map((f) => [f.id, f]));
  const frames = await Promise.all(
    input.file_ids.map(async (id) => {
      const file = byId.get(id);
      const kind = typeof file?.metadata?.kind === 'string' ? file.metadata.kind : undefined;
      const foreignPrivate = kind !== undefined && OWNER_ONLY_FILE_KINDS.has(kind) && file?.uploadedByUserId !== ctx.session.userId;
      if (!file || file.bucketId !== org || foreignPrivate) throw new ActionError('file_not_found', 'File not found');
      return deps.storage.download(id);
    }),
  );
  if (input.mode === 'identification' && input.claimed_identity_id) {
    throw new ActionError('invalid_input', 'claimed_identity_id is only accepted in verification mode');
  }
  const claim = input.claimed_identity_id ? claimedRef(input.claimed_identity_id) : undefined;
  try {
    const session = await deps.store.openSession({
      p_org: org,
      p_app: input.application_id,
      p_key: null,
      p_session: randomUUID(),
      p_mode: input.mode,
      p_claimed_identity: claim?.id ?? null,
      p_claimed_ref_hash: claim?.refHash ?? null,
      p_access_point: input.access_point_id ?? null,
      p_device_ref: `console:${ctx.session.userId ?? 'admin'}`,
      p_nonce_hash: sha256Hex(randomBytes(32)),
      p_ip: null,
      p_user_agent: 'itap-admin-console',
    });
    const decision = await runAuthentication(deps, {
      organizationId: org,
      applicationId: input.application_id,
      session,
      claimedIdentityId: claim?.id ?? null,
      sequence: fromFrames(frames),
      binding: { kind: 'console' },
      requestThreshold: input.threshold ?? null,
      deadline: startedAt + 10_000,
      startedAt,
    });
    const body = await authenticationResponse(randomUUID(), decision, deps.storage);
    return {
      request_id: body.request_id,
      session_id: body.session_id,
      attempt_id: decision.attempt_id,
      outcome: body.outcome,
      authenticated: body.authenticated,
      confidence: body.confidence ?? null,
      identity_id: body.identity?.id ?? null,
      attributes: body.identity?.attributes ?? null,
      attack_outcome: body.attack_outcome,
      failure_code: body.failure?.code ?? null,
      failure_message: body.failure?.message ?? null,
      failure_guidance: body.failure?.guidance ?? null,
      next_step: body.next_step,
    };
  } catch (error: unknown) {
    const known = error instanceof ServiceError ? error : serviceErrorFromSql(error);
    if (known) throw new ActionError(known.code, known.message);
    throw error;
  }
});
