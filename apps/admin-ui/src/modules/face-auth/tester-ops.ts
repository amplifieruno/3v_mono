import { defineMutation } from '@burojs/core';
import { z } from 'zod';
import type { ActionRefusalReader } from '../../data/action-refusals';
import { type HasuraOperationEntry, hasuraOperation, rootOf } from '../../data/operations';
import { AUTHENTICATION_ATTEMPT_RESOURCE, AUTHENTICATION_SESSION_RESOURCE } from '../../data/resource-names';
import { schema } from '../../data/schema';
import { AUTH_MODES } from '../../enums/face-auth';
import { FACE_AUTH_BINDING } from './application-ops';

/** Frames a sequence takes (`MIN_FRAMES`/`MAX_FRAMES` of the backend's `auth-service/frames.ts`). */
export const AUTH_MIN_FRAMES = 3;
export const AUTH_MAX_FRAMES = 5;

const NO_TEST = ' Nothing was authenticated.';

/**
 * What `authenticate_face` answers before it decides anything: the action's own codes, and the
 * service errors of `auth_open_session` and of the frames (`auth-service/errors.ts`).
 */
export const AUTHENTICATE_REFUSALS: Readonly<Record<string, string>> = {
  application_inactive: 'The application is not active (suspended, revoked or gone): only an active application can be tested.' + NO_TEST,
  mode_not_allowed: 'The application may not use this mode: allow it on the application’s Modes and attributes tab, or test the other mode.' + NO_TEST,
  access_point_required: 'The application is bound to access points: choose one of its doors.' + NO_TEST,
  access_point_not_bound: 'The application does not serve this access point: choose one of the doors on its Population tab.' + NO_TEST,
  file_not_found: 'A frame could not be read (removed, or not a file of this organization). Add the frames again.' + NO_TEST,
  invalid_sequence: 'The frames are not a valid sequence (3 to 5 JPEG or PNG images):',
  sequence_too_large: 'The frames are too large together (at most 5 MB): use smaller images.' + NO_TEST,
  face_service_unavailable: 'The face service is unavailable at the moment: try again in a moment.' + NO_TEST,
  invalid_request: 'The request was not valid:',
  invalid_input: 'The request was not valid:',
  no_organization: 'Your session has no organization: sign in to an organization again.' + NO_TEST,
};

/** The refusal reader of `authenticate_face` (form-level issues; texts ending in a colon carry the server's words). */
export const authenticateRefusals: ActionRefusalReader = ({ code, message }) => {
  const text = AUTHENTICATE_REFUSALS[code];
  if (text === undefined) return null;
  return [{ code, message: text.endsWith(':') ? `${text} ${message}.${NO_TEST}` : text, path: [] }];
};

export const authenticateInput = z.object({
  applicationId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).min(AUTH_MIN_FRAMES).max(AUTH_MAX_FRAMES),
  mode: z.enum(AUTH_MODES),
  claimedIdentityId: z.string().nullable(),
  accessPointId: z.string().nullable(),
  threshold: z.number().nullable(),
});

/** What `authenticate_face` answers (`FaceAuthResult`): the fields the API's answer carries, plus the attempt. */
export const authenticateOutput = z.object({
  request_id: z.string(),
  session_id: z.string(),
  attempt_id: z.string().nullable(),
  outcome: z.string(),
  authenticated: z.boolean(),
  confidence: z.number().nullable(),
  identity_id: z.string().nullable(),
  attributes: z.record(z.string(), z.unknown()).nullable(),
  attack_outcome: z.string(),
  failure_code: z.string().nullable(),
  failure_message: z.string().nullable(),
  failure_guidance: z.string().nullable(),
  next_step: z.string(),
});

export type AuthenticateResult = z.infer<typeof authenticateOutput>;

export const authenticateOperation: HasuraOperationEntry = hasuraOperation(
  FACE_AUTH_BINDING,
  'authenticateFace',
  {
    kind: 'mutation',
    document: `mutation AuthenticateFace($application: uuid!, $files: [uuid!]!, $mode: String!, $claimed: String, $accessPoint: uuid, $threshold: Float) {
  authenticate_face(application_id: $application, file_ids: $files, mode: $mode, claimed_identity_id: $claimed, access_point_id: $accessPoint, threshold: $threshold) {
    request_id session_id attempt_id outcome authenticated confidence identity_id attributes attack_outcome failure_code failure_message failure_guidance next_step
  }
}`,
    variables: (input) => {
      const { applicationId, fileIds, mode, claimedIdentityId, accessPointId, threshold } = input as z.infer<typeof authenticateInput>;
      return {
        application: applicationId,
        files: fileIds,
        mode,
        claimed: mode === 'verification' ? claimedIdentityId : null,
        accessPoint: accessPointId,
        threshold,
      };
    },
    mapResult: (data) => rootOf(data, 'authenticate_face'),
  },
  authenticateRefusals,
);

/**
 * The Hasura action `authenticate_face` (org_admin): the API's authentication over 3 to 5 stored
 * frames, under a new console session, recorded like any attempt. Not replayed: a second send is
 * a second attempt (and the same frames again read as a replayed sequence).
 */
export const authenticateFace = defineMutation('itap:authenticate-face', {
  binding: authenticateOperation.binding,
  input: schema(authenticateInput),
  output: schema(authenticateOutput),
  effects: [{ resource: AUTHENTICATION_SESSION_RESOURCE }, { resource: AUTHENTICATION_ATTEMPT_RESOURCE }],
});
