import type { Env } from '../config/env.js';
import { createInsightFaceClient } from '../face/insightFaceClient.js';
import { createHasuraClient } from '../hasura/client.js';
import { createStorageClient } from '../storage/storageClient.js';
import { serverKeys } from './crypto.js';
import type { AuthServiceDeps } from './routes.js';
import { createAuthStore } from './store.js';

/** Hasura and storage calls of the service are bounded (a hung dependency fails the request, retryable). */
const DEPENDENCY_TIMEOUT_MS = 10_000;

export function createAuthServiceDeps(env: Env): AuthServiceDeps {
  return {
    store: createAuthStore(createHasuraClient(env, undefined, { timeoutMs: DEPENDENCY_TIMEOUT_MS })),
    storage: createStorageClient(env, { timeoutMs: DEPENDENCY_TIMEOUT_MS }),
    insightFace: createInsightFaceClient(env.INSIGHTFACE_API_URL, { timeoutMs: DEPENDENCY_TIMEOUT_MS }),
    keys: env.AUTH_KEY_ENCRYPTION_KEY ? serverKeys(env.AUTH_KEY_ENCRYPTION_KEY) : undefined,
  };
}
