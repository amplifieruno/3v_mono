import { f } from '@burojs/field-types';
import {
  ACCESS_POINT_RESOURCE,
  AUTHENTICATION_SESSION_RESOURCE,
  CLIENT_APPLICATION_RESOURCE,
  IDENTITY_RESOURCE,
  PROFILE_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { AUTH_MODES, AUTH_MODE_ENUM } from '../../enums/face-auth';
import {
  AUTH_ATTACK_OUTCOMES,
  AUTH_ATTACK_OUTCOME_ENUM,
  AUTH_FAILURE_REASONS,
  AUTH_FAILURE_REASON_ENUM,
  AUTH_OUTCOMES,
  AUTH_OUTCOME_ENUM,
  AUTH_REVIEW_STATUSES,
  AUTH_REVIEW_STATUS_ENUM,
  AUTH_STEPS,
  AUTH_STEP_ENUM,
} from '../../enums/face-auth-records';
import { enumField } from '../../enums/field';
import { dateTime } from '../../fields/date-time';
import { storageFile } from '../../fields/storage-file';
import { authLink } from './session-fields';

/** Page size of the session and attempt logs (a busy kiosk authenticates several times a minute). */
export const AUTH_LOG_PAGE_SIZE = 50;

/** `storage.files.metadata.kind` of an attempt's evidence frame: sensitive (`itap.sensitive_file_kinds`). */
export const AUTH_CAPTURE_FILE_KIND = 'auth_capture';

const count = (label: string, summary: string, inModes?: readonly ('list' | 'show')[]) =>
  f.number({ system: true, nullable: true, ...(inModes === undefined ? {} : { in: [...inModes] }), texts: { label, doc: { summary } } });

const score = (label: string, summary: string) => f.number({ system: true, nullable: true, texts: { label, doc: { summary } } });

/**
 * Columns of `itap.authentication_attempts` the `org_admin` role reads: one capture (or second
 * factor) of a session and how the engine decided it, written by the engine only. Only the review
 * of a pending partial match changes it (`review_authentication_attempt`).
 */
export const authenticationAttemptFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  attempted_at: dateTime({ system: true, texts: { label: 'Attempted', doc: { summary: 'When the capture was decided.' } } }),
  session_id: authLink(AUTHENTICATION_SESSION_RESOURCE, 'Session', 'The authentication session the attempt belongs to.'),
  application_id: authLink(CLIENT_APPLICATION_RESOURCE, 'Application', 'The client application that sent the capture.'),
  attempt_no: count('No.', 'The attempt’s position in its session (1 for the first capture).'),
  step: enumField(AUTH_STEPS, AUTH_STEP_ENUM, { system: true, texts: { label: 'Step', doc: { summary: 'First capture, recapture or second factor.' } } }),
  mode: enumField(AUTH_MODES, AUTH_MODE_ENUM, { system: true, texts: { label: 'Mode', doc: { summary: 'Identification (who is this?) or verification of a claimed person.' } } }),
  outcome: enumField(AUTH_OUTCOMES, AUTH_OUTCOME_ENUM, {
    system: true,
    texts: { label: 'Outcome', doc: { summary: 'Success, partial match (just under the threshold) or failure.' } },
  }),
  failure_reason: enumField(AUTH_FAILURE_REASONS, AUTH_FAILURE_REASON_ENUM, {
    system: true,
    nullable: true,
    texts: {
      label: 'Failure reason',
      doc: { summary: 'Why the attempt failed, as recorded (the caller of a verification sees “below threshold” for “not in population”). Empty unless it failed.' },
    },
  }),
  attack_outcome: enumField(AUTH_ATTACK_OUTCOMES, AUTH_ATTACK_OUTCOME_ENUM, {
    system: true,
    texts: { label: 'Attack check', doc: { summary: 'What the presentation attack checks found in the sequence of frames.' } },
  }),
  confidence: score(
    'Confidence',
    'How similar the face was to the best candidate, from 0 to 1; compared with the threshold used. Empty when nothing was compared.',
  ),
  threshold_used: score(
    'Threshold used',
    'The threshold in force for this attempt: the application’s, raised for a large population or by the request, never lowered.',
  ),
  population_size: count('Population', 'How many identities the application could authenticate at that moment (after segments, facilities, shifts and the door).'),
  matched_identity_id: authLink(IDENTITY_RESOURCE, 'Matched identity', 'The identity the face matched best (a success or a partial match).'),
  profile_id: authLink(PROFILE_RESOURCE, 'Person', 'The profile of the matched identity.'),
  claimed_identity_id: authLink(IDENTITY_RESOURCE, 'Claimed identity', 'In verification, the identity the person claimed to be.'),
  access_point_id: authLink(ACCESS_POINT_RESOURCE, 'Access point', 'The door of the session, when the application is bound to doors.'),
  latency_ms: count('Latency (ms)', 'How long the whole decision took, from the frames received to the answer, in milliseconds.'),
  retrieval_candidates: count('Candidates', 'How many identities the first, coarse stage kept for the comparison (at most 20).', ['show']),
  retrieval_hit: f.boolean({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Claimed among candidates', doc: { summary: 'In verification, whether the claimed identity was among the candidates of the first stage.' } },
  }),
  comparison_score: score('Comparison score', 'The best template similarity of the second stage, before it is reported as the confidence.'),
  retrieval_ms: count('Retrieval (ms)', 'Time of the first stage (candidates by face centroid), in milliseconds.', ['show']),
  comparison_ms: count('Comparison (ms)', 'Time of the second stage (best template of each candidate), in milliseconds.', ['show']),
  model_version: f.text({ system: true, nullable: true, in: ['show'], texts: { label: 'Model', doc: { summary: 'The face model that computed the embedding.' } } }),
  evidence_file_id: storageFile({
    bucket: 'organization',
    kind: AUTH_CAPTURE_FILE_KIND,
    sensitive: true,
    displayOnly: true,
    accept: 'image/jpeg',
    in: ['show'],
    texts: {
      label: 'Evidence',
      doc: {
        summary:
          'One frame of a capture that did not succeed, kept as evidence. Opening it asks the platform for a short-lived link and is written to the audit log; a success keeps no frame.',
      },
    },
  }),
  review_status: enumField(AUTH_REVIEW_STATUSES, AUTH_REVIEW_STATUS_ENUM, {
    system: true,
    texts: { label: 'Review', doc: { summary: 'Pending for a partial match after the last recapture; then approved or rejected by a reviewer.' } },
  }),
  reviewed_by: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    open: 'none',
    texts: { label: 'Reviewed by', doc: { summary: 'The administrator who approved or rejected the attempt.' } },
  }),
  reviewed_at: dateTime({ system: true, texts: { label: 'Reviewed', doc: { summary: 'When the attempt was approved or rejected.' } } }),
  review_note: f.text({
    system: true,
    nullable: true,
    in: ['show'],
    texts: { label: 'Review note', doc: { summary: 'Why the reviewer approved or rejected the attempt; also in the audit log.' } },
  }),
  device_ref: f.text({ system: true, nullable: true, in: ['show'], texts: { label: 'Device', doc: { summary: 'The device reference the application sent.' } } }),
  ip: f.text({ system: true, nullable: true, in: ['show'], texts: { label: 'IP address', doc: { summary: 'The address the application called from.' } } }),
};

/** The columns of an attempt list (the log and the application's Attempts tab). */
export const AUTHENTICATION_ATTEMPT_COLUMNS = [
  'attempted_at',
  'application_id',
  'mode',
  'outcome',
  'failure_reason',
  'confidence',
  'threshold_used',
  'review_status',
] as const;
