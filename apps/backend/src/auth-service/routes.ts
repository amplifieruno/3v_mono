import { randomUUID } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import type { InsightFaceBatchClient } from '../face/insightFaceClient.js';
import type { StorageClient } from '../storage/storageClient.js';
import { claimedRef, sequenceBinding, sessionNonce, sha256Hex, type ServerKeys } from './crypto.js';
import { sendServiceError, ServiceError, serviceErrorFromSql } from './errors.js';
import { decodeSequence } from './frames.js';
import { requestIdOf, requireClientKey, type AuthClient } from './keyAuth.js';
import { hexEqual } from './signature.js';
import { openApiDocument } from './openapi/document.js';
import { runAuthentication } from './pipeline.js';
import { TokenBuckets } from './rateLimit.js';
import { authenticationResponse } from './response.js';
import {
  authenticateSchema,
  DEFAULT_TIMEOUT_MS,
  isUuid,
  openSessionSchema,
  parseBody,
  recaptureSchema,
  secondFactorSchema,
  type CaptureBody,
} from './schemas.js';
import type { AuthStore } from './store.js';
import { sessionStatusResponse } from './status.js';

export type AuthServiceDeps = {
  store: AuthStore;
  storage: StorageClient;
  insightFace: InsightFaceBatchClient;
  /** Undefined when AUTH_KEY_ENCRYPTION_KEY is not configured: every keyed route answers 503. */
  keys: ServerKeys | undefined;
  buckets?: TokenBuckets;
  now?: () => number;
};

type Handler = (req: Request, res: Response, client: AuthClient, requestId: string) => Promise<void>;

const sessionNotFound = () => new ServiceError(404, 'session_not_found', 'Session not found');

/** Express glue: ServiceErrors and SQL refusal codes become the error envelope; anything else is a 500. */
function handle(fn: Handler) {
  return async (req: Request, res: Response) => {
    const requestId = String(res.locals.requestId ?? requestIdOf(req));
    try {
      await fn(req, res, res.locals.client as AuthClient, requestId);
    } catch (error: unknown) {
      const known = error instanceof ServiceError ? error : serviceErrorFromSql(error);
      if (known) return sendServiceError(res, requestId, known);
      console.error('Auth service request failed:', error);
      sendServiceError(res, requestId, new ServiceError(500, 'internal', 'Internal error', true, 'Retry in a moment.'));
    }
  };
}

const body = (req: Request): Buffer => (Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));

/** Public REST API of the face authentication service: `/v1/auth/*` (key auth, see keyAuth.ts and openapi.ts). */
export function authServiceRouter(deps: AuthServiceDeps): Router {
  const router = Router();
  const buckets = deps.buckets ?? new TokenBuckets();
  // Raw body: the signature covers the exact bytes. 5 MB of frames is ~6.7 MB of base64.
  router.use(express.raw({ type: () => true, limit: '8mb' }));

  router.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument());
  });

  router.get('/health', async (req, res) => {
    const requestId = requestIdOf(req);
    const [database, faceService] = await Promise.all([
      Promise.race([deps.store.ping().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]).catch(() => false),
      deps.insightFace.health(2000),
    ]);
    const checks = { database: database ? 'ok' : 'unavailable', face_service: faceService ? 'ok' : 'unavailable' };
    if (database && faceService) {
      res.json({ request_id: requestId, status: 'ok', checks, timestamp: new Date().toISOString() });
      return;
    }
    res.status(503).json({
      request_id: requestId,
      status: 'degraded',
      checks,
      error: { code: 'service_degraded', message: 'A dependency of the service is unavailable', retryable: true, guidance: 'Retry in a moment.' },
    });
  });

  router.use((req, res, next) => {
    if (deps.keys) return next();
    sendServiceError(res, requestIdOf(req), new ServiceError(503, 'service_not_configured', 'The authentication service is not configured', true));
  });
  if (deps.keys) router.use(requireClientKey({ store: deps.store, keys: deps.keys, buckets, now: deps.now }));

  router.post('/sessions', handle(async (req, res, client, requestId) => {
    const input = parseBody(openSessionSchema, body(req));
    const keys = deps.keys as ServerKeys;
    if (input.mode === 'identification' && input.claimed_identity_id !== undefined) {
      throw new ServiceError(400, 'invalid_request', 'claimed_identity_id is only accepted in verification mode');
    }
    const claim = input.claimed_identity_id === undefined ? undefined : claimedRef(input.claimed_identity_id);
    const id = randomUUID();
    const nonce = sessionNonce(keys, id);
    const session = await deps.store.openSession({
      p_org: client.organizationId,
      p_app: client.applicationId,
      p_key: client.keyId,
      p_session: id,
      p_mode: input.mode,
      p_claimed_identity: claim?.id ?? null,
      p_claimed_ref_hash: claim?.refHash ?? null,
      p_access_point: input.access_point_id ?? null,
      p_device_ref: input.device_ref,
      p_nonce_hash: sha256Hex(nonce),
      p_ip: req.ip ?? null,
      p_user_agent: req.header('user-agent') ?? null,
    });
    res.status(201).json({
      request_id: requestId,
      session_id: session.id,
      mode: session.mode,
      nonce: nonce.toString('base64'),
      expires_at: session.expires_at,
    });
  }));

  async function capture(req: Request, res: Response, client: AuthClient, requestId: string, sessionId: string, input: CaptureBody, recapture: boolean) {
    const startedAt = Date.now();
    const keys = deps.keys as ServerKeys;
    if (!isUuid(sessionId)) throw sessionNotFound();
    const session = await deps.store.session(client.organizationId, client.applicationId, sessionId.toLowerCase());
    if (!session) throw sessionNotFound();
    if (recapture !== session.step_count > 0) {
      throw new ServiceError(409, 'session_step_invalid', recapture
        ? 'Nothing to recapture yet: authenticate first'
        : 'The session already has an attempt: use /v1/auth/sessions/{id}/recapture');
    }
    if (session.mode === 'identification' && input.claimed_identity_id !== undefined) {
      throw new ServiceError(400, 'invalid_request', 'claimed_identity_id is only accepted in verification mode');
    }
    if (session.mode === 'verification' && input.claimed_identity_id === undefined) {
      throw new ServiceError(400, 'invalid_request', 'Verification requires claimed_identity_id (repeat the session claim)');
    }
    const sequence = decodeSequence(input.frames);
    const nonce = sessionNonce(keys, session.id);
    const expected = sequenceBinding(client.secret, nonce, sequence.digest, session.device_ref ?? '');
    const valid = hexEqual(sha256Hex(nonce), session.nonce_hash) && hexEqual(expected, input.binding);
    const decision = await runAuthentication(deps, {
      organizationId: client.organizationId,
      applicationId: client.applicationId,
      session,
      claimedIdentityId: input.claimed_identity_id === undefined ? null : claimedRef(input.claimed_identity_id).id,
      sequence,
      binding: { kind: 'verified', valid },
      requestThreshold: input.threshold ?? null,
      deadline: startedAt + (input.timeout_ms ?? DEFAULT_TIMEOUT_MS),
      startedAt,
    });
    res.json(await authenticationResponse(requestId, decision, deps.storage));
  }

  router.post('/authenticate', handle(async (req, res, client, requestId) => {
    const input = parseBody(authenticateSchema, body(req));
    await capture(req, res, client, requestId, input.session_id, input, false);
  }));

  router.post('/sessions/:id/recapture', handle(async (req, res, client, requestId) => {
    await capture(req, res, client, requestId, req.params.id, parseBody(recaptureSchema, body(req)), true);
  }));

  router.post('/sessions/:id/second-factor', handle(async (req, res, client, requestId) => {
    const input = parseBody(secondFactorSchema, body(req));
    if (!isUuid(req.params.id)) throw sessionNotFound();
    const decision = await deps.store.secondFactor({
      p_org: client.organizationId,
      p_app: client.applicationId,
      p_session: req.params.id.toLowerCase(),
      p_passed: input.result === 'passed',
      p_method: input.method,
    });
    res.json(await authenticationResponse(requestId, decision, deps.storage));
  }));

  router.get('/sessions/:id', handle(async (req, res, client, requestId) => {
    if (!isUuid(req.params.id)) throw sessionNotFound();
    const state = await deps.store.sessionState(client.organizationId, client.applicationId, req.params.id.toLowerCase());
    if (!state) throw sessionNotFound();
    res.json(await sessionStatusResponse(requestId, state, deps.storage));
  }));

  router.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
    const requestId = String(res.locals.requestId ?? requestIdOf(req));
    const status = (error as { status?: number; type?: string }).status;
    if (status === 413) return sendServiceError(res, requestId, new ServiceError(413, 'sequence_too_large', 'The request body is too large'));
    if (res.headersSent) return next(error);
    console.error('Auth service error:', error);
    sendServiceError(res, requestId, new ServiceError(500, 'internal', 'Internal error', true, 'Retry in a moment.'));
  });

  return router;
}
