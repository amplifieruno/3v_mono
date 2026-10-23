import { defineBlock, prop } from '@burojs/core';
import { z } from 'zod';

const text = () => prop(z.string().nullable().optional()).default(null);

/**
 * What "Authenticate a face" opens with the answer of `authenticate_face` (`then.open`): the
 * decision as the API answers it to a client application (outcome, authenticated, confidence, the
 * identity and its permitted attributes, the attack check, the failure with its message and
 * guidance, the next step), then links to the recorded session and attempt, where the threshold,
 * the population and the evidence are shown.
 */
export const authDecisionBlock = defineBlock('itap:auth-decision', {
  texts: {
    label: 'Authentication decision',
    authenticated: 'Authenticated',
    notAuthenticated: 'Not authenticated',
    outcome: 'Outcome',
    confidence: 'Confidence',
    noConfidence: 'Not reported (only a success reports it)',
    identity: 'Identity',
    openIdentity: 'Open the identity',
    attributes: 'Attributes shared with the application',
    noAttributes: 'None: the application shares no attributes, or nobody was authenticated.',
    photoLink: 'Short-lived photo link',
    photoUnsigned: 'No link: the person has no photo, or it could not be signed.',
    attack: 'Attack check',
    failure: 'Failure',
    failureCode: 'Code: {{code}}',
    guidance: 'Guidance shown to the person',
    nextStep: 'Next step for the application',
    next_none: 'None: the session is closed.',
    next_capture: 'Send the first capture.',
    next_recapture: 'Capture again (a recapture in the same session).',
    next_second_factor: 'Confirm the person with a second factor.',
    next_review: 'Wait for an administrator to review the partial match.',
    recorded: 'Recorded as an attempt of a console session (device console:<you>), like any request of the application.',
    openAttempt: 'Open the attempt',
    openSession: 'Open the session',
    requestId: 'Request {{id}}',
  },
  props: {
    requestId: prop(z.string()),
    sessionId: prop(z.string()),
    attemptId: text(),
    outcome: prop(z.string()),
    authenticated: prop(z.boolean()),
    confidence: prop(z.number().nullable().optional()).default(null),
    identityId: text(),
    attributes: prop(z.record(z.string(), z.unknown()).nullable().optional()).default(null),
    attackOutcome: prop(z.string()),
    failureCode: text(),
    failureMessage: text(),
    failureGuidance: text(),
    nextStep: prop(z.string()),
  },
});
