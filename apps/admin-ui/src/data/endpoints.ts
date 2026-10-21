/**
 * Same-origin paths the console calls. In dev the Vite proxy forwards them
 * (`vite.config.ts`); in production the reverse proxy in front of the bundle
 * does the same.
 *
 * `AUTH_BASE` carries `/v1`: hasura-auth serves its routes under `/v1`, and the
 * proxy strips only the `/auth` prefix, so `/auth/v1/signin/email-password`
 * reaches `http://localhost:4100/v1/signin/email-password`.
 */
export const GRAPHQL_ENDPOINT = '/v1/graphql';
export const AUTH_BASE = '/auth/v1';
export const STORAGE_BASE = '/storage';
