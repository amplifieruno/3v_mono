import type { Response } from 'express';
import { HasuraError } from '../hasura/client.js';

/** Error envelope of every non-2xx answer: `{ request_id, error: { code, message, retryable, guidance } }`. */
export class ServiceError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly guidance: string | null = null,
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export function sendServiceError(res: Response, requestId: string, error: ServiceError, headers: Record<string, string> = {}): void {
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.status(error.status).json({
    request_id: requestId,
    error: { code: error.code, message: error.message, retryable: error.retryable, guidance: error.guidance },
  });
}

export const unauthorized = () => new ServiceError(401, 'unauthorized', 'Missing or invalid request signature');

/** SQL refusal codes of the service functions → public service errors. */
const SQL_ERRORS: Record<string, () => ServiceError> = {
  client_application_inactive: () => new ServiceError(403, 'application_inactive', 'The client application is not active'),
  client_application_not_found: () => new ServiceError(403, 'application_inactive', 'The client application is not active'),
  auth_mode_not_allowed: () => new ServiceError(403, 'mode_not_allowed', 'The application may not use this mode'),
  auth_mode_invalid: () => new ServiceError(400, 'invalid_request', 'mode must be identification or verification'),
  auth_claimed_identity_not_allowed: () =>
    new ServiceError(400, 'invalid_request', 'claimed_identity_id is only accepted in verification mode'),
  auth_claimed_identity_required: () =>
    new ServiceError(400, 'invalid_request', 'Verification requires claimed_identity_id (repeat the session claim)'),
  access_point_not_bound: () => new ServiceError(403, 'access_point_not_bound', 'The application does not serve this access point'),
  auth_device_ref_invalid: () => new ServiceError(400, 'invalid_request', 'device_ref must be 1..128 characters'),
  auth_session_not_found: () => new ServiceError(404, 'session_not_found', 'Session not found'),
  auth_session_closed: () => new ServiceError(409, 'session_closed', 'The session is closed; open a new session'),
  auth_session_expired: () => new ServiceError(409, 'session_expired', 'The session expired; open a new session'),
  auth_session_mismatch: () =>
    new ServiceError(409, 'session_mismatch', 'mode, claimed identity and access point must equal the session'),
  auth_recapture_limit: () => new ServiceError(409, 'recapture_limit', 'No recapture left in this session'),
  auth_second_factor_not_allowed: () =>
    new ServiceError(409, 'second_factor_not_allowed', 'A second factor is accepted only after a partial match'),
  auth_second_factor_invalid: () => new ServiceError(400, 'invalid_request', 'result and method are required'),
  auth_threshold_invalid: () => new ServiceError(400, 'invalid_request', 'threshold must be between 0 and 1'),
};

/** Maps a Hasura error carrying one of the SQL codes; anything else is rethrown by the caller. */
export function serviceErrorFromSql(error: unknown): ServiceError | undefined {
  if (!(error instanceof HasuraError)) return undefined;
  const text = `${error.detail ?? ''} ${error.message}`;
  const code = Object.keys(SQL_ERRORS).find((c) => new RegExp(`\\b${c}\\b`).test(text));
  return code ? SQL_ERRORS[code]() : undefined;
}

/** Public failure reasons of an authentication outcome, with the guidance shown to the person. */
export const FAILURE_TEXTS: Record<string, { message: string; guidance: string; retryable: boolean }> = {
  no_face: {
    message: 'No face was found in the captured images',
    guidance: 'Face the camera with your whole face inside the frame.',
    retryable: true,
  },
  multiple_faces: {
    message: 'More than one face was found in the captured images',
    guidance: 'Make sure only one person is in front of the camera.',
    retryable: true,
  },
  low_quality: {
    message: 'The face is too small or partly outside the image',
    guidance: 'Move closer to the camera and keep your face centred.',
    retryable: true,
  },
  blur: {
    message: 'The images are blurred',
    guidance: 'Hold still and keep the camera steady while the images are taken.',
    retryable: true,
  },
  poor_lighting: {
    message: 'The face is too dark or overexposed',
    guidance: 'Move to an evenly lit place and avoid strong light behind you.',
    retryable: true,
  },
  below_threshold: {
    message: 'The face could not be authenticated',
    guidance: 'Use another sign-in method or ask staff for help.',
    retryable: false,
  },
  attack_detected: {
    message: 'The capture was rejected by presentation attack checks',
    guidance: 'Use the live camera of a supported device; photos, screens and replayed captures are not accepted.',
    retryable: false,
  },
  liveness_failed: {
    message: 'Liveness could not be confirmed',
    guidance: 'Capture a new sequence from the live camera.',
    retryable: false,
  },
  second_factor_failed: {
    message: 'The second factor was not confirmed',
    guidance: 'Use another sign-in method or ask staff for help.',
    retryable: false,
  },
  partial_match: {
    message: 'The match was not conclusive; additional verification is required',
    guidance: 'Look straight at the camera in good light and capture again, or confirm with a second factor.',
    retryable: true,
  },
};
