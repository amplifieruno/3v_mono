import { type FlowCheck, type FlowConfig, type Layout, ref } from '@burojs/core';
import { f } from '@burojs/field-types';
import { NAV_ICONS } from '../../app/nav';
import { ACCESS_POINT_RESOURCE, CLIENT_APPLICATION_RESOURCE, IDENTITY_RESOURCE } from '../../data/resource-names';
import { AUTH_MODES, AUTH_MODE_ENUM } from '../../enums/face-auth';
import { enumField } from '../../enums/field';
import { rangeValidator } from '../../fields/bounded-number';
import { facePhotoIds } from '../../fields/face-photos-format';
import { facePhotos } from '../../fields/face-photos';
import { SEARCH_IMAGE_KIND } from '../../fields/bulk-fields';
import { sandboxIdentity } from '../../fields/sandbox-identity';
import { authDecisionBlock } from './decision-block';
import { AUTH_MAX_FRAMES, AUTH_MIN_FRAMES, authenticateFace } from './tester-ops';

const THRESHOLD_RANGE = { min: 0, max: 1 } as const;

/** The tester's form: the application, the mode, whom a verification claims, the door, a raised threshold and the frames. */
export const testerFields = {
  application_id: f.relation({
    to: CLIENT_APPLICATION_RESOURCE,
    required: true,
    candidates: [{ field: 'status', op: 'eq', value: 'active' }],
    texts: { label: 'Application', doc: { summary: 'The active client application to authenticate as: its population, modes, threshold and attributes apply.' } },
  }),
  mode: enumField(AUTH_MODES, AUTH_MODE_ENUM, {
    required: true,
    texts: { label: 'Mode', doc: { summary: 'Identification searches the application’s whole population; verification compares with the claimed identity only.' } },
  }),
  claimed_identity_id: sandboxIdentity(
    f.relation({
      to: IDENTITY_RESOURCE,
      nullable: true,
      texts: {
        label: 'Claimed identity',
        doc: {
          summary:
            'In verification, the identity the person claims to be. For a sandbox application only its synthetic test identities are offered.',
        },
      },
    }),
    'application_id',
  ),
  access_point_id: f.relation({
    to: ACCESS_POINT_RESOURCE,
    nullable: true,
    candidates: [{ field: 'status', op: 'ne', value: 'inactive' }],
    texts: {
      label: 'Access point',
      doc: { summary: 'Required when the application is bound to access points: one of its doors (only people allowed through it are authenticated).' },
    },
  }),
  threshold: f.number({
    nullable: true,
    min: THRESHOLD_RANGE.min,
    max: THRESHOLD_RANGE.max,
    validate: rangeValidator(THRESHOLD_RANGE),
    texts: {
      label: 'Threshold',
      doc: { summary: 'Optional, from 0 to 1: a request may raise the application’s threshold up to its maximum, never lower it.' },
    },
  }),
  frames: facePhotos({
    min: AUTH_MIN_FRAMES,
    max: AUTH_MAX_FRAMES,
    // Owner-only (`search`): test frames are not organization photos; the action reads its caller's own search files.
    kind: SEARCH_IMAGE_KIND,
    texts: {
      label: 'Frames',
      doc: {
        summary:
          'A sequence of 3 to 5 frames of one face, taken with the camera or uploaded. Take them a moment apart: identical frames or a still picture are refused as an attack.',
      },
    },
  }),
};

type TesterFields = typeof testerFields;

const verification = (l: Layout<TesterFields>) => l.equals(l.ref('values', 'mode'), 'verification');

/** Application and mode, the claimed identity in verification only, then the door, the threshold and the frames. */
export function testerFormBody(l: Layout<TesterFields>) {
  return [
    l.grid(['application_id', 'mode']),
    l.field('claimed_identity_id', { when: verification(l) }),
    l.grid(['access_point_id', 'threshold']),
    'frames',
  ] as const;
}

/**
 * The claimed identity a verification needs. The frame count needs no check: the frames field is
 * required and refuses 1 or 2 frames, and more than 5 (Review Focus 4).
 */
export const TESTER_CHECKS: FlowCheck[] = [
  {
    id: 'claimedInVerification',
    severity: 'error',
    anchor: 'claimed_identity_id',
    texts: 'Verification compares with a claimed identity: choose it.',
    when: ({ values }) => values.mode === 'verification' && (values.claimed_identity_id === null || values.claimed_identity_id === undefined || values.claimed_identity_id === ''),
  },
];

/** The action's input from the form (the claimed identity only in verification). */
export function testerInput(values: Readonly<Record<string, unknown>>) {
  const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);
  const mode = values.mode === 'verification' ? 'verification' : 'identification';
  return {
    applicationId: String(values.application_id ?? ''),
    fileIds: facePhotoIds(values.frames),
    mode,
    claimedIdentityId: mode === 'verification' ? text(values.claimed_identity_id) : null,
    accessPointId: text(values.access_point_id),
    threshold: typeof values.threshold === 'number' ? values.threshold : null,
  } as const;
}

/**
 * "Authenticate a face" (`authenticate_face`), drawn in place on its page (an item flow of the
 * tester workspace, G63): the form, then the decision in its place (`itap:auth-decision`). The
 * attempt is recorded like any request of the application. Not retried (a second send is a
 * second attempt, and the same frames again read as a replay); a lost answer is looked up in the
 * attempts log.
 */
export const authenticateFlow = {
  texts: {
    label: 'Authenticate',
    doc: {
      summary:
        'Runs a face authentication as the chosen application would, with 3 to 5 frames from the camera or from files, and shows the decision the API returns.',
    },
  },
  icon: NAV_ICONS.authTester,
  // Only where the page places it inline.
  surfaces: { default: false },
  form: {
    fields: testerFields,
    initial: { mode: { kind: 'literal', value: 'identification' }, frames: { kind: 'literal', value: [] } },
    body: testerFormBody,
  },
  checks: TESTER_CHECKS,
  submit: {
    mutation: authenticateFace,
    retry: 'never',
    input: ({ values }) => testerInput(values),
  },
  then: {
    open: {
      block: authDecisionBlock,
      props: {
        requestId: ref('result', 'request_id'),
        sessionId: ref('result', 'session_id'),
        attemptId: ref('result', 'attempt_id'),
        outcome: ref('result', 'outcome'),
        authenticated: ref('result', 'authenticated'),
        confidence: ref('result', 'confidence'),
        identityId: ref('result', 'identity_id'),
        attributes: ref('result', 'attributes'),
        attackOutcome: ref('result', 'attack_outcome'),
        failureCode: ref('result', 'failure_code'),
        failureMessage: ref('result', 'failure_message'),
        failureGuidance: ref('result', 'failure_guidance'),
        nextStep: ref('result', 'next_step'),
      },
    },
  },
} satisfies FlowConfig<unknown, Record<never, never>, TesterFields>;
