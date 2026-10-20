import { components } from './schemas.js';

/**
 * OpenAPI 3.1 description of `/v1/auth/*` (served at GET /v1/auth/openapi.json): the machine-readable interface client
 * libraries and capture kits are generated from. Hand-written; `openapi.test.ts` checks that it parses and documents
 * every route and response code of the router.
 */

const json = (schema: string) => ({ 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } });
const ok = (description: string, schema: string) => ({ description, content: json(schema) });
const error = (description: string) => ({ description, content: json('Error') });

const keyed = {
  '401': error('Missing / invalid signature (`unauthorized`), clock skew (`timestamp_skew`), a repeated signature '
    + '(`replayed_request`), revoked or expired key.'),
  '403': error('Application not active (`application_inactive`), mode not allowed, access point not bound.'),
  '429': {
    description: 'Per-key rate limit (`rate_limited`, retryable).',
    headers: { 'Retry-After': { $ref: '#/components/headers/RetryAfter' } },
    content: json('Error'),
  },
  '500': error('Internal error (retryable).'),
  '503': error('Service not configured or a dependency is unavailable (retryable).'),
};

const capture = {
  '200': ok('The decision: success, partial_match or failure (with code, message, guidance).', 'AuthenticationResult'),
  '400': error('Invalid body, frames or claim (`invalid_request`, `invalid_sequence`).'),
  ...keyed,
  '404': error('Unknown session (`session_not_found`).'),
  '409': error('Session closed / expired / mismatched, wrong step, or no recapture left.'),
  '413': error('Sequence larger than 5 MB (`sequence_too_large`).'),
  '504': error('The request timeout elapsed before a decision (`timeout`, retryable).'),
};

const sessionPath = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } };
const requestId = { $ref: '#/components/parameters/RequestId' };

export const AUTH_ROUTES: { method: 'get' | 'post'; path: string; keyed: boolean }[] = [
  { method: 'post', path: '/v1/auth/sessions', keyed: true },
  { method: 'post', path: '/v1/auth/authenticate', keyed: true },
  { method: 'post', path: '/v1/auth/sessions/{id}/recapture', keyed: true },
  { method: 'post', path: '/v1/auth/sessions/{id}/second-factor', keyed: true },
  { method: 'get', path: '/v1/auth/sessions/{id}', keyed: true },
  { method: 'get', path: '/v1/auth/health', keyed: false },
  { method: 'get', path: '/v1/auth/openapi.json', keyed: false },
];

export function openApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'ITAP Face Authentication API',
      version: '1.0.0',
      description: 'Face authentication for registered client applications (SA_6). Integration sequence: (1) POST '
        + '/v1/auth/sessions with the mode (identification, or verification with claimed_identity_id) and device_ref '
        + '→ session_id + nonce (once); (2) capture 3–5 frames, compute binding = HMAC(secret, nonce ‖ sha256(frames) '
        + '‖ device_ref) and POST /v1/auth/authenticate; (3) follow next_step: recapture (≤ 2), second_factor, or '
        + 'review (poll GET /v1/auth/sessions/{id}); the second factor exists only in verification. Outcomes: success (identity id, confidence, permitted attributes), '
        + 'partial_match (no identity; additional verification), failure (code + human-readable reason + guidance). '
        + 'The population is fixed server-side per application; a verification of an identity outside it fails '
        + 'exactly like a non-match. Every response carries request_id and session_id.',
    },
    servers: [{ url: '/' }],
    security: [{ itapHmac: [] }],
    paths: {
      '/v1/auth/sessions': {
        post: {
          operationId: 'openSession',
          summary: 'Open an authentication session (5 minutes)',
          parameters: [requestId],
          requestBody: { required: true, content: json('OpenSessionRequest') },
          responses: { '201': ok('The session and its nonce (returned once).', 'Session'), '400': capture['400'], ...keyed },
        },
      },
      '/v1/auth/authenticate': {
        post: {
          operationId: 'authenticate',
          summary: 'Submit the first capture sequence of a session',
          parameters: [requestId],
          requestBody: { required: true, content: json('AuthenticateRequest') },
          responses: capture,
        },
      },
      '/v1/auth/sessions/{id}/recapture': {
        post: {
          operationId: 'recapture',
          summary: 'Submit a new sequence after a quality failure or partial match (at most 2 per session)',
          parameters: [sessionPath, requestId],
          requestBody: { required: true, content: json('CaptureRequest') },
          responses: capture,
        },
      },
      '/v1/auth/sessions/{id}/second-factor': {
        post: {
          operationId: 'secondFactor',
          summary: 'Assert the result of the application\'s own second factor after a partial match (verification only)',
          parameters: [sessionPath, requestId],
          requestBody: { required: true, content: json('SecondFactorRequest') },
          responses: {
            '200': ok('success with the partially matched identity, or failure second_factor_failed.', 'AuthenticationResult'),
            '400': capture['400'],
            ...keyed,
            '404': capture['404'],
            '409': error('Session closed / expired, an identification session (`second_factor_not_allowed`: never '
              + 'offered in identification), or the last attempt was not a partial match.'),
          },
        },
      },
      '/v1/auth/sessions/{id}': {
        get: {
          operationId: 'getSession',
          summary: 'Session status (polling manual review)',
          parameters: [sessionPath, requestId],
          responses: { '200': ok('The session state.', 'SessionStatus'), ...keyed, '404': capture['404'] },
        },
      },
      '/v1/auth/health': {
        get: {
          operationId: 'health',
          summary: 'Health of the service and its dependencies (database, face service)',
          security: [],
          responses: {
            '200': ok('All dependencies available.', 'Health'),
            '503': ok('Degraded: a dependency is unavailable (`service_degraded`, retryable).', 'Health'),
          },
        },
      },
      '/v1/auth/openapi.json': {
        get: {
          operationId: 'openapi',
          summary: 'This document',
          security: [],
          responses: { '200': { description: 'OpenAPI 3.1 document', content: { 'application/json': { schema: { type: 'object' } } } } },
        },
      },
    },
    components,
  };
}
