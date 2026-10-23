import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { claimedRef, serverKeys, sha256Hex } from '../auth-service/crypto.js';
import { ServiceError, serviceErrorFromSql } from '../auth-service/errors.js';
import { fromFrames, MAX_FRAMES, MIN_FRAMES } from '../auth-service/frames.js';
import { ClientKeyError, issueClientKey } from '../auth-service/keys.js';
import { runAuthentication } from '../auth-service/pipeline.js';
import { authenticationResponse } from '../auth-service/response.js';
import { createAuthServiceDeps } from '../auth-service/service.js';
import type { HasuraClient } from '../hasura/client.js';
import { OWNER_ONLY_FILE_KINDS, SENSITIVE_FILE_KINDS } from '../storage/storageClient.js';
import { ActionError, defineAction, type ActionContext } from './types.js';

const FILES = `
  query AuthConsoleFiles($ids: [uuid!]!) { files(where: { id: { _in: $ids } }) { id bucketId metadata uploadedByUserId } }
`;

function organizationOf(ctx: ActionContext<unknown>): string {
  const org = ctx.session.organizationId?.toLowerCase();
  if (!org) throw new ActionError('no_organization', 'An organization session is required');
  return org;
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
    try {
      return await issueClientKey(ctx.actor, serverKeys(ctx.env.AUTH_KEY_ENCRYPTION_KEY), ctx.input.application_id, ctx.input.expires_at ?? null);
    } catch (error: unknown) {
      if (error instanceof ClientKeyError) {
        const message = error.code === 'client_key_prefix_conflict' ? 'Could not allocate a unique key prefix; retry' : error.message;
        throw new ActionError(error.code, message);
      }
      throw error;
    }
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

/** `metadata.kind` of the tester's frames: owner-only search images of their uploader. */
const SEARCH_FILE_KIND = 'search';

/** The queue reason of a tester probe frame (`itap.pending_file_deletions.reason`). */
export const PROBE_FRAME_REASON = 'auth_tester_frame';

const QUEUE_FRAMES = `
  mutation QueueProbeFrames($objects: [pending_file_deletions_insert_input!]!) {
    insert_pending_file_deletions(objects: $objects, on_conflict: { constraint: pending_file_deletions_file_key, update_columns: [] }) {
      affected_rows
    }
  }
`;

/**
 * Queues the tester's probe frames for deletion by the `drain_file_deletions` cron: only the caller's own `search`
 * files (the frames the tester uploaded), never evidence or files of other kinds. Idempotent (a file already queued
 * is left as it is; the drain skips a file referenced again) and never fails the answer: a frame that could not be
 * queued stays, as before.
 */
export async function queueProbeFrames(admin: HasuraClient, org: string, frames: readonly FileRow[]): Promise<void> {
  const ids = [...new Set(frames.map((f) => f.id))];
  if (ids.length === 0) return;
  const objects = ids.map((file_id) => ({ organization_id: org, file_id, reason: PROBE_FRAME_REASON }));
  await admin.request(QUEUE_FRAMES, { objects }).catch(() => undefined);
}

/**
 * authenticate_face (org_admin console test): the same pipeline as POST /v1/auth/authenticate over 3–5 stored files
 * of the organization, under a new console session (device_ref `console:<user>`), recorded like any attempt. The
 * session binding does not apply (no client key); the attack outcome comes from the real sequence checks only.
 * Once the files pass validation, the caller's own `search` frames are queued for deletion whatever the outcome
 * (decision or refusal): tester frames are biometric data nothing else references.
 */
export const authenticateFace = defineAction(authenticateInput, async (ctx) => {
  const org = organizationOf(ctx);
  const input = ctx.input;
  if (input.mode === 'identification' && input.claimed_identity_id) {
    throw new ActionError('invalid_input', 'claimed_identity_id is only accepted in verification mode');
  }
  const startedAt = Date.now();
  const requestId = randomUUID();
  const deps = createAuthServiceDeps(ctx.env);
  const { files } = await ctx.admin.request<{ files: FileRow[] }>(FILES, { ids: input.file_ids });
  const byId = new Map(files.map((f) => [f.id, f]));
  const probes = input.file_ids.map((id) => {
    const file = byId.get(id);
    const kind = typeof file?.metadata?.kind === 'string' ? file.metadata.kind : undefined;
    const foreignPrivate = kind !== undefined && OWNER_ONLY_FILE_KINDS.has(kind) && file?.uploadedByUserId !== ctx.session.userId;
    // Sensitive kinds (evidence captures, profile documents, DSR exports) are never probes.
    const sensitive = kind !== undefined && SENSITIVE_FILE_KINDS.has(kind);
    if (!file || file.bucketId !== org || foreignPrivate || sensitive) throw new ActionError('file_not_found', 'File not found');
    return { file, ownFrame: kind === SEARCH_FILE_KIND && file.uploadedByUserId === ctx.session.userId };
  });
  const ownFrames = probes.filter((p) => p.ownFrame).map((p) => p.file);
  try {
    return await decide(ctx, deps, { org, input, probes: probes.map((p) => p.file.id), startedAt, requestId });
  } finally {
    await queueProbeFrames(ctx.admin, org, ownFrames);
  }
});

type DecideArgs = {
  org: string;
  input: z.infer<typeof authenticateInput>;
  probes: string[];
  startedAt: number;
  requestId: string;
};

async function decide(ctx: ActionContext<unknown>, deps: ReturnType<typeof createAuthServiceDeps>, args: DecideArgs) {
  const { org, input, startedAt, requestId } = args;
  const frames = await Promise.all(args.probes.map((id) => deps.storage.download(id)));
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
      requestId,
    });
    const body = await authenticationResponse(requestId, decision, deps.storage, input.mode);
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
}
