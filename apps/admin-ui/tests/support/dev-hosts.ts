/**
 * The dev stack as the tests reach it, shared by the vitest dev-stack tests
 * (`tests/integration/*.dev.test.ts`) and the Playwright specs (`e2e/`).
 * `127.0.0.1`, not `localhost`: Node may resolve `localhost` to `::1`, where
 * the dev services do not listen.
 */
export const DEV_STACK_ENABLED = process.env.ITAP_DEV_STACK === '1';

export const DEV_GRAPHQL = 'http://127.0.0.1:8080/v1/graphql';
/** hasura-auth with its `/v1` prefix. */
export const DEV_AUTH = 'http://127.0.0.1:4100/v1';
/** hasura-storage through the Nhost CLI's local host name (it routes by host). */
export const DEV_STORAGE = 'http://local.storage.local.nhost.run';

export const ADMIN_EMAIL = 'admin@itap.demo';
/** A second administrator of Nova only: the other member of a four-eyes approval. */
export const NOVA_ADMIN_EMAIL = 'nova.admin@itap.demo';
export const NOVA_NAME = 'Nova Tower Business Center';
export const RIVERSIDE_NAME = 'Riverside Office Park';
export const NOVA_FACILITY = 'Nova Tower';
export const RIVERSIDE_FACILITY = 'Riverside Building A';

/** The seed password (`apps/backend/.env`); the dev-stack tests fail without it. */
export function seedPassword(): string {
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is not set (see apps/backend/.env).');
  return password;
}

/**
 * The dev Hasura admin secret (`GRAPHQL_ADMIN_SECRET` in `apps/backend/.env`), for cleaning up rows
 * the console's role may not delete (an incident is history for `org_admin`). Tests only.
 */
export function devAdminSecret(): string {
  const secret = process.env.GRAPHQL_ADMIN_SECRET;
  if (!secret) throw new Error('GRAPHQL_ADMIN_SECRET is not set (see apps/backend/.env).');
  return secret;
}
