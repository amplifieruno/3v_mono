import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/*
 * Enums of the face authentication records (sessions and attempts); values are the rows of the
 * Hasura enum tables in `AUTH_RECORD_ENUM_TABLES`.
 */

export const AUTH_SESSION_STATUS_ENUM = 'auth_session_status';
export const AUTH_STEP_ENUM = 'auth_step';
export const AUTH_OUTCOME_ENUM = 'auth_outcome';
export const AUTH_REVIEW_STATUS_ENUM = 'auth_review_status';
export const AUTH_FAILURE_REASON_ENUM = 'auth_failure_reason';
export const AUTH_ATTACK_OUTCOME_ENUM = 'auth_attack_outcome';

export const AUTH_SESSION_STATUSES = ['open', 'review', 'succeeded', 'failed', 'expired'] as const;
export const AUTH_STEPS = ['initial', 'recapture', 'second_factor'] as const;
export const AUTH_OUTCOMES = ['success', 'partial_match', 'failure'] as const;
export const AUTH_REVIEW_STATUSES = ['none', 'pending', 'approved', 'rejected'] as const;
export const AUTH_FAILURE_REASONS = [
  'no_face',
  'multiple_faces',
  'low_quality',
  'blur',
  'poor_lighting',
  'not_in_population',
  'not_retrieved',
  'below_threshold',
  'liveness_failed',
  'attack_detected',
  'second_factor_failed',
] as const;
export const AUTH_ATTACK_OUTCOMES = ['passed', 'printed_photo', 'screen_replay', 'mask', 'injection', 'not_checked'] as const;

export const authSessionStatusEnum = defineEnum({
  name: AUTH_SESSION_STATUS_ENUM,
  values: enumValues(AUTH_SESSION_STATUSES, {
    open: 'info',
    review: 'warning',
    succeeded: 'success',
    failed: 'destructive',
    expired: 'outline',
  }),
  texts: {
    open: { label: 'Open', doc: { summary: 'Still accepting captures (a recapture or a second factor may follow).' } },
    review: { label: 'Waiting for review', doc: { summary: 'Ended on a partial match after the last recapture: an administrator decides.' } },
    succeeded: { label: 'Succeeded', doc: { summary: 'Closed with a confirmed person (a match, an approved review or a second factor).' } },
    failed: { label: 'Failed', doc: { summary: 'Closed without a confirmed person.' } },
    expired: { label: 'Expired', doc: { summary: 'Not completed within its five minutes.' } },
  },
});

export const authStepEnum = defineEnum({
  name: AUTH_STEP_ENUM,
  values: enumValues(AUTH_STEPS, { initial: 'info', recapture: 'secondary', second_factor: 'warning' }),
  texts: {
    initial: { label: 'Initial', doc: { summary: 'The first capture of the session.' } },
    recapture: { label: 'Recapture', doc: { summary: 'A repeated capture after a partial match or a quality failure (at most two).' } },
    second_factor: { label: 'Second factor', doc: { summary: 'The application reported a second factor after a partial match.' } },
  },
});

export const authOutcomeEnum = defineEnum({
  name: AUTH_OUTCOME_ENUM,
  values: enumValues(AUTH_OUTCOMES, { success: 'success', partial_match: 'warning', failure: 'destructive' }),
  texts: {
    success: { label: 'Success', doc: { summary: 'Matched at or above the threshold in force.' } },
    partial_match: {
      label: 'Partial match',
      doc: { summary: 'The best score fell just under the threshold (within 0.08): a recapture, a second factor or a review decides.' },
    },
    failure: { label: 'Failure', doc: { summary: 'No match, a quality failure, an attack or a refused second factor.' } },
  },
});

export const authReviewStatusEnum = defineEnum({
  name: AUTH_REVIEW_STATUS_ENUM,
  values: enumValues(AUTH_REVIEW_STATUSES, { none: 'outline', pending: 'warning', approved: 'success', rejected: 'destructive' }),
  texts: {
    none: { label: 'No review', doc: { summary: 'The attempt needs no manual review.' } },
    pending: { label: 'Pending review', doc: { summary: 'A partial match after the last recapture, waiting for an administrator.' } },
    approved: { label: 'Approved', doc: { summary: 'A reviewer confirmed the person: the session, if still open, succeeded.' } },
    rejected: { label: 'Rejected', doc: { summary: 'A reviewer refused the person: the session, if still open, failed.' } },
  },
});

export const authFailureReasonEnum = defineEnum({
  name: AUTH_FAILURE_REASON_ENUM,
  values: enumValues(AUTH_FAILURE_REASONS, {
    no_face: 'secondary',
    multiple_faces: 'secondary',
    low_quality: 'secondary',
    blur: 'secondary',
    poor_lighting: 'secondary',
    not_in_population: 'outline',
    not_retrieved: 'outline',
    below_threshold: 'outline',
    liveness_failed: 'warning',
    attack_detected: 'destructive',
    second_factor_failed: 'warning',
  }),
  texts: {
    no_face: { label: 'No face', doc: { summary: 'No face was found in the capture.' } },
    multiple_faces: { label: 'Several faces', doc: { summary: 'More than one face was found in the capture.' } },
    low_quality: { label: 'Low quality', doc: { summary: 'The face was too small or partly outside the image.' } },
    blur: { label: 'Blurred', doc: { summary: 'The capture was too blurred.' } },
    poor_lighting: { label: 'Poor lighting', doc: { summary: 'The face was too dark or overexposed.' } },
    not_in_population: {
      label: 'Not in population',
      doc: {
        summary:
          'Verification of someone outside the application’s population: nothing was compared. The caller is told “below threshold”, so it cannot learn who is enrolled.',
      },
    },
    not_retrieved: { label: 'No candidate', doc: { summary: 'Nobody in the population came close enough to be compared.' } },
    below_threshold: { label: 'Below threshold', doc: { summary: 'The best comparison stayed under the partial band.' } },
    liveness_failed: { label: 'Liveness failed', doc: { summary: 'The application requires liveness and it could not be confirmed.' } },
    attack_detected: { label: 'Attack detected', doc: { summary: 'The sequence was refused by the presentation attack checks (still picture, injection, replay).' } },
    second_factor_failed: { label: 'Second factor failed', doc: { summary: 'The application reported a failed second factor.' } },
  },
});

export const authAttackOutcomeEnum = defineEnum({
  name: AUTH_ATTACK_OUTCOME_ENUM,
  values: enumValues(AUTH_ATTACK_OUTCOMES, {
    passed: 'success',
    printed_photo: 'destructive',
    screen_replay: 'destructive',
    mask: 'destructive',
    injection: 'destructive',
    not_checked: 'outline',
  }),
  texts: {
    passed: { label: 'Passed', doc: { summary: 'No sign of an attack in the sequence.' } },
    printed_photo: { label: 'Still picture', doc: { summary: 'The frames did not change: a printed photo or a still screen held to the camera.' } },
    screen_replay: { label: 'Screen replay', doc: { summary: 'The sequence looks like a video replayed on a screen.' } },
    mask: { label: 'Mask', doc: { summary: 'A mask was detected.' } },
    injection: {
      label: 'Injection',
      doc: { summary: 'Byte-identical frames, a sequence already sent before, or a capture not bound to its session: not from a live camera.' },
    },
    not_checked: { label: 'Not checked', doc: { summary: 'The check was not performed.' } },
  },
});

export const AUTH_RECORD_ENUMS = [
  authSessionStatusEnum,
  authStepEnum,
  authOutcomeEnum,
  authReviewStatusEnum,
  authFailureReasonEnum,
  authAttackOutcomeEnum,
] as const;

export const AUTH_RECORD_ENUM_TABLES: Readonly<Record<string, string>> = {
  [AUTH_SESSION_STATUS_ENUM]: 'auth_session_statuses',
  [AUTH_STEP_ENUM]: 'auth_steps',
  [AUTH_OUTCOME_ENUM]: 'auth_outcomes',
  [AUTH_REVIEW_STATUS_ENUM]: 'auth_review_statuses',
  [AUTH_FAILURE_REASON_ENUM]: 'auth_failure_reasons',
  [AUTH_ATTACK_OUTCOME_ENUM]: 'auth_attack_outcomes',
};
