import { FAILURE_TEXTS } from '../errors.js';

/** Component schemas of the OpenAPI 3.1 document (JSON Schema 2020-12 dialect). */

export const SERVICE_ERROR_CODES = [
  'invalid_request', 'invalid_sequence', 'unauthorized', 'timestamp_skew', 'replayed_request', 'key_revoked', 'key_expired',
  'application_inactive', 'mode_not_allowed', 'access_point_not_bound', 'access_point_required', 'session_not_found', 'session_closed',
  'session_expired', 'session_mismatch', 'session_step_invalid', 'recapture_limit', 'second_factor_not_allowed',
  'sequence_too_large', 'rate_limited', 'internal', 'face_service_unavailable', 'service_not_configured',
  'service_degraded', 'timeout',
] as const;

const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const nextStep = {
  type: 'string',
  enum: ['capture', 'recapture', 'second_factor', 'review', 'none'],
  description: 'capture (GET /sessions/{id} of a fresh session only): send the first sequence to /authenticate; '
    + 'recapture: send a new sequence to /sessions/{id}/recapture (at most 2 per session); second_factor: confirm with '
    + 'your own factor at /sessions/{id}/second-factor (verification sessions only, offered from the first partial '
    + 'match on; a recapture is still accepted instead); review: the attempt was referred to manual review, poll GET '
    + '/sessions/{id}; none: the session is finished.',
};
const attackOutcome = {
  type: 'string',
  enum: ['passed', 'not_checked', 'printed_photo', 'screen_replay', 'mask', 'injection'],
  description: 'Presentation attack / stream substitution outcome, recorded separately from the match outcome.',
};
const attributes = {
  type: 'object',
  description: 'Exactly the attributes the application is permitted to receive (display_name, photo, profile_type, '
    + 'company, department, employee_id, access_level, segments); photo is a short-lived signed URL.',
  properties: {
    photo: { oneOf: [{ type: 'null' }, { type: 'object', properties: { url: { type: 'string' }, expires_at: timestamp } }] },
    segments: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

export const components = {
  parameters: {
    RequestId: {
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      schema: uuid,
      description: 'Client request id (FS AuthenticationRequest.id); echoed as request_id and stored on the attempt. '
        + 'Generated when absent or not a UUID. When sent, its trimmed value is covered by the signature (fifth line of '
        + 'the signed string).',
    },
  },
  headers: {
    RetryAfter: { description: 'Seconds until the key may send again.', schema: { type: 'integer', minimum: 1 } },
  },
  securitySchemes: {
    itapHmac: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: '`ITAP-HMAC key=<8-char key prefix>, ts=<unix seconds>, sig=<hex>` with sig = hex HMAC-SHA256(key '
        + 'secret, METHOD + "\\n" + PATH (with query) + "\\n" + ts + "\\n" + hex sha256(raw body) [+ "\\n" + '
        + 'X-Request-Id]); the fifth line is the trimmed X-Request-Id value, present only when that header is sent. '
        + 'ts within ±300 s; each signed request is accepted once: its signature is remembered until ts + 301 s, after '
        + 'which the timestamp check refuses it anyway (a repeat is `replayed_request`). A request refused for an '
        + 'expired key, an inactive application or the rate limit is not remembered. A request without a well-formed '
        + 'header is refused before its body is read.',
    },
  },
  schemas: {
    Error: {
      type: 'object',
      required: ['request_id', 'error'],
      description: 'Error envelope of every non-2xx answer. session_id is present once the session of the request is '
        + 'known (e.g. 409, 413, 503, 504 on a capture), never for session_not_found.',
      properties: {
        request_id: uuid,
        session_id: uuid,
        error: {
          type: 'object',
          required: ['code', 'message', 'retryable', 'guidance'],
          properties: {
            code: { type: 'string', enum: [...SERVICE_ERROR_CODES] },
            message: { type: 'string' },
            retryable: { type: 'boolean' },
            guidance: { type: ['string', 'null'] },
          },
        },
      },
    },
    Failure: {
      type: 'object',
      required: ['code', 'message', 'guidance', 'retryable'],
      properties: {
        code: { type: 'string', enum: Object.keys(FAILURE_TEXTS) },
        message: { type: 'string' },
        guidance: { type: 'string' },
        retryable: { type: 'boolean' },
      },
    },
    OpenSessionRequest: {
      type: 'object',
      required: ['mode', 'device_ref'],
      additionalProperties: false,
      properties: {
        mode: { type: 'string', enum: ['identification', 'verification'] },
        claimed_identity_id: { type: 'string', description: 'Verification only: the claimed identity (UUID).' },
        access_point_id: { ...uuid, description: 'Optional access point the application serves (must be bound).' },
        device_ref: { type: 'string', minLength: 1, maxLength: 128, description: 'Stable id of the capturing device.' },
      },
    },
    Session: {
      type: 'object',
      required: ['request_id', 'session_id', 'mode', 'nonce', 'expires_at'],
      properties: {
        request_id: uuid,
        session_id: uuid,
        mode: { type: 'string' },
        nonce: { type: 'string', contentEncoding: 'base64', description: '32 bytes, returned once; input of the binding.' },
        expires_at: timestamp,
      },
    },
    CaptureRequest: {
      type: 'object',
      required: ['frames', 'binding'],
      additionalProperties: false,
      properties: {
        frames: {
          type: 'array', minItems: 3, maxItems: 5,
          items: { type: 'string', contentEncoding: 'base64', contentMediaType: 'image/jpeg' },
          description: '3 to 5 consecutive frames of the live camera (JPEG or PNG), at most 5 MB decoded in total.',
        },
        binding: {
          type: 'string', pattern: '^[0-9a-fA-F]{64}$',
          description: 'hex HMAC-SHA256(key secret, nonce bytes ‖ sha256(frame bytes concatenated in order) ‖ '
            + 'utf8(device_ref)). A sequence bound to another session, application or device is rejected as injection.',
        },
        claimed_identity_id: { type: 'string', description: 'Verification sessions: repeat the session claim.' },
        threshold: { type: 'number', minimum: 0, maximum: 1, description: 'Raise-only; never below the population floor.' },
        timeout_ms: { type: 'integer', minimum: 100, maximum: 10000, default: 5000 },
      },
    },
    AuthenticateRequest: {
      allOf: [
        { $ref: '#/components/schemas/CaptureRequest' },
        { type: 'object', required: ['session_id'], properties: { session_id: uuid } },
      ],
    },
    SecondFactorRequest: {
      type: 'object',
      required: ['result', 'method'],
      additionalProperties: false,
      properties: {
        result: { type: 'string', enum: ['passed', 'failed'] },
        method: { type: 'string', minLength: 1, maxLength: 64, description: 'e.g. pin, card, otp' },
      },
    },
    AuthenticationResult: {
      type: 'object',
      required: ['request_id', 'session_id', 'timestamp', 'outcome', 'authenticated', 'attack_outcome', 'next_step'],
      properties: {
        request_id: uuid,
        session_id: uuid,
        timestamp,
        outcome: { type: 'string', enum: ['success', 'partial_match', 'failure'] },
        authenticated: { type: 'boolean' },
        confidence: { type: 'number', description: 'Success only.' },
        identity: {
          type: 'object', description: 'Success only.',
          properties: { id: uuid, attributes },
        },
        attack_outcome: attackOutcome,
        failure: { $ref: '#/components/schemas/Failure' },
        next_step: nextStep,
      },
    },
    SessionStatus: {
      type: 'object',
      required: ['request_id', 'session_id', 'status', 'next_step'],
      properties: {
        request_id: uuid,
        session_id: uuid,
        timestamp,
        mode: { type: 'string' },
        status: { type: 'string', enum: ['open', 'succeeded', 'failed', 'review', 'expired'] },
        step: { type: 'string', enum: ['initial', 'recapture', 'second_factor', 'review'] },
        attempts: { type: 'integer' },
        recapture_count: { type: 'integer' },
        expires_at: timestamp,
        last_outcome: { type: ['string', 'null'] },
        last_failure_code: { type: ['string', 'null'] },
        review_status: { type: ['string', 'null'] },
        authenticated: { type: 'boolean' },
        identity: { type: 'object', properties: { id: uuid, attributes } },
        next_step: nextStep,
      },
    },
    Health: {
      type: 'object',
      required: ['status', 'checks'],
      properties: {
        request_id: uuid,
        status: { type: 'string', enum: ['ok', 'degraded'] },
        checks: {
          type: 'object',
          properties: { database: { type: 'string' }, face_service: { type: 'string' } },
        },
        error: { $ref: '#/components/schemas/Error/properties/error' },
      },
    },
  },
};
