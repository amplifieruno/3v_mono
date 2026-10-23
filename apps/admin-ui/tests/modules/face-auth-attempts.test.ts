import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { withActionRefusals } from '../../src/data/action-refusals';
import { selectFieldsOf } from '../../src/data/mapping';
import {
  AUTHENTICATION_ATTEMPT_RESOURCE,
  AUTHENTICATION_SESSION_RESOURCE,
  AUTH_TESTER_RESOURCE,
} from '../../src/data/resource-names';
import { validateFacePhotos } from '../../src/fields/face-photos-format';
import { ACTION_REFUSALS, HASURA_OPERATIONS, ITAP_TABLES } from '../../src/modules';
import { FACE_AUTH_BINDING } from '../../src/modules/face-auth/application-ops';
import { authenticationAttemptFields } from '../../src/modules/face-auth/attempt-fields';
import { testerFields, testerInput } from '../../src/modules/face-auth/tester-flow';
import { SANDBOX_IDENTITY_FIELD } from '../../src/fields/sandbox-identity';

/**
 * Sessions, attempts, review and the tester without the UI: the logs are read-only and paged by
 * key without counts; Approve and Reject are offered on a pending partial match only, take a note
 * and send the decision (Review Focus 3); the evidence frame is a sensitive file (opened through
 * `open_file`); "Authenticate a face" refuses fewer than 3 frames before sending and opens the
 * decision with every field the API returns (Review Focus 4); refusals read as sentences.
 */

const ADMIN = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001', roles: ['org_admin'] };
const ORG = '11111111-1111-4111-8111-000000000001';
const APP = '99999999-9999-4999-8999-000000000021';
const ATTEMPT = '99999999-9999-4999-8999-000000000022';
const SESSION = '99999999-9999-4999-8999-000000000023';
const FRAMES = ['99999999-9999-4999-8999-000000000031', '99999999-9999-4999-8999-000000000032', '99999999-9999-4999-8999-000000000033'];

const attempt = (extra: Record<string, unknown> = {}) => ({
  id: ATTEMPT,
  session_id: SESSION,
  application_id: APP,
  outcome: 'partial_match',
  review_status: 'pending',
  matched_identity_id: '99999999-9999-4999-8999-000000000024',
  ...extra,
});

const flow = (resource: string, action: string, record: Record<string, unknown>, mutations: Record<string, unknown[]> = {}) =>
  runFlow(app, { resource, action }, { user: ADMIN, record, rows: { [resource]: [record] }, mutations: mutations as never });

const decision = {
  request_id: 'req-1',
  session_id: SESSION,
  attempt_id: ATTEMPT,
  outcome: 'success',
  authenticated: true,
  confidence: 0.912,
  identity_id: '99999999-9999-4999-8999-000000000024',
  attributes: { display_name: 'Ada Example' },
  attack_outcome: 'passed',
  failure_code: null,
  failure_message: null,
  failure_guidance: null,
  next_step: 'none',
};

beforeAll(async () => {
  await app.ready;
});

describe('the tester form', () => {
  it('should upload frames as owner-only search files and follow the application for the claimed identity', () => {
    expect(testerFields.frames.meta).toMatchObject({ kind: 'search', min: 3, max: 5 });
    expect(testerFields.claimed_identity_id.ui).toMatchObject({ input: SANDBOX_IDENTITY_FIELD });
    expect(testerFields.claimed_identity_id.meta).toMatchObject({ sandboxApplication: { kind: 'ref', source: 'values', path: ['application_id'] } });
  });
});

describe('the session and attempt logs', () => {
  it('should be read-only, keyset paged and never counted on every page', () => {
    for (const resource of [AUTHENTICATION_SESSION_RESOURCE, AUTHENTICATION_ATTEMPT_RESOURCE]) {
      const def = app.registry.get(resource) as { readonly operations?: Record<string, unknown> } | undefined;
      expect(def?.operations).toMatchObject({ create: false, edit: false, delete: false });
      expect(ITAP_TABLES[resource]).toMatchObject({ noAggregate: true });
    }
    expect(ITAP_TABLES[AUTHENTICATION_ATTEMPT_RESOURCE]?.selectFields).toEqual(selectFieldsOf(authenticationAttemptFields));
  });

  it('should show the evidence frame as a sensitive auth_capture file (opened through open_file)', () => {
    expect(authenticationAttemptFields.evidence_file_id.meta).toMatchObject({ kind: 'auth_capture', sensitive: true });
    expect(authenticationAttemptFields.evidence_file_id.ui).toMatchObject({ display: 'itap.storage-file' });
  });
});

describe('review of a partial match (Review Focus 3)', () => {
  it('should approve a pending partial match with a note', async () => {
    const run = await flow(AUTHENTICATION_ATTEMPT_RESOURCE, 'approve', attempt(), {
      'itap:review-authentication-attempt': [answer({ id: ATTEMPT, review_status: 'approved', reviewed_at: '2026-10-23T05:00:00Z', session_id: SESSION })],
    }).open();
    run.fill({ note: 'Badge checked by the guard' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { attemptId: ATTEMPT, approve: true, note: 'Badge checked by the guard' } });
  });

  it('should reject with a note, and refuse without one', async () => {
    const mutations = {
      'itap:review-authentication-attempt': [answer({ id: ATTEMPT, review_status: 'rejected', reviewed_at: null, session_id: SESSION })],
    };
    const empty = await flow(AUTHENTICATION_ATTEMPT_RESOURCE, 'reject', attempt(), mutations).open();
    await empty.submit();
    empty.assertNotSubmitted();
    const run = await flow(AUTHENTICATION_ATTEMPT_RESOURCE, 'reject', attempt(), mutations).open();
    run.fill({ note: 'Not the person on the badge' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({ input: { attemptId: ATTEMPT, approve: false } });
  });

  it('should offer the review only on a pending partial match', async () => {
    for (const record of [
      attempt({ review_status: 'approved' }),
      attempt({ review_status: 'none' }),
      attempt({ outcome: 'success', review_status: 'none' }),
      attempt({ outcome: 'failure', review_status: 'none' }),
      // Not reachable in the database (pending only for a partial match), but the guard holds both.
      attempt({ outcome: 'failure', review_status: 'pending' }),
    ]) {
      (await flow(AUTHENTICATION_ATTEMPT_RESOURCE, 'approve', record).open()).assertUnavailable();
      (await flow(AUTHENTICATION_ATTEMPT_RESOURCE, 'reject', record).open()).assertUnavailable();
    }
  });

  it('should send the decision with a trimmed note (empty is none)', () => {
    const review = HASURA_OPERATIONS[FACE_AUTH_BINDING]?.reviewAuthenticationAttempt;
    expect(review?.variables?.({ attemptId: ATTEMPT, approve: true, note: '  ok  ' })).toEqual({ attempt: ATTEMPT, approve: true, note: 'ok' });
    expect(review?.variables?.({ attemptId: ATTEMPT, approve: false, note: ' ' })).toEqual({ attempt: ATTEMPT, approve: false, note: null });
    expect(review?.mapResult?.({ review_authentication_attempt: [{ id: ATTEMPT }] })).toEqual({ id: ATTEMPT });
  });
});

describe('Authenticate a face (Review Focus 4)', () => {
  const tester = () => ({ organization_id: ORG, id: ORG });

  it('should refuse fewer than 3 frames before sending', async () => {
    for (const frames of [[], FRAMES.slice(0, 2)]) {
      const run = await flow(AUTH_TESTER_RESOURCE, 'authenticate', tester(), { 'itap:authenticate-face': [answer(decision)] }).open();
      run.fill({ application_id: APP, mode: 'identification', frames });
      await run.submit();
      run.assertNotSubmitted();
    }
    expect(validateFacePhotos(FRAMES.slice(0, 2), { min: 3, max: 5 })).toMatchObject({ code: 'facePhotos.tooFew' });
  });

  it('should send 3 frames and open the decision with every field the API returns', async () => {
    const run = await flow(AUTH_TESTER_RESOURCE, 'authenticate', tester(), { 'itap:authenticate-face': [answer(decision)] }).open();
    run.fill({ application_id: APP, mode: 'identification', frames: FRAMES, claimed_identity_id: 'ignored' });
    await run.submit();
    run.assertOutcome('success');
    expect(run.submitted[0]?.call).toMatchObject({
      input: { applicationId: APP, fileIds: FRAMES, mode: 'identification', claimedIdentityId: null, accessPointId: null, threshold: null },
    });
    expect(run.state.effects?.open).toMatchObject({
      props: {
        requestId: 'req-1',
        sessionId: SESSION,
        attemptId: ATTEMPT,
        outcome: 'success',
        authenticated: true,
        confidence: 0.912,
        identityId: decision.identity_id,
        attributes: { display_name: 'Ada Example' },
        attackOutcome: 'passed',
        failureCode: null,
        failureMessage: null,
        failureGuidance: null,
        nextStep: 'none',
      },
    });
  });

  it('should ask for the claimed identity in verification, and send it only then', async () => {
    const run = await flow(AUTH_TESTER_RESOURCE, 'authenticate', tester(), { 'itap:authenticate-face': [answer(decision)] }).open();
    run.fill({ application_id: APP, mode: 'verification', frames: FRAMES });
    await run.submit();
    run.assertNotSubmitted();
    expect(testerInput({ application_id: APP, mode: 'verification', claimed_identity_id: 'id-1', frames: FRAMES, threshold: 0.7 })).toMatchObject({
      mode: 'verification',
      claimedIdentityId: 'id-1',
      threshold: 0.7,
    });
    const op = HASURA_OPERATIONS[FACE_AUTH_BINDING]?.authenticateFace;
    expect(op?.variables?.({ applicationId: APP, fileIds: FRAMES, mode: 'identification', claimedIdentityId: 'x', accessPointId: null, threshold: null })).toMatchObject({
      claimed: null,
    });
  });
});

describe('refusals', () => {
  const failing = (error: DataError) =>
    withActionRefusals(defineDataProvider({ mutations: { custom: defineMutationHandler(async () => Promise.reject(error)) } }), ACTION_REFUSALS);
  const call = (operation: string) => ({ kind: 'custom', resource: FACE_AUTH_BINDING, operation, input: {} }) as never;
  const actionRefusal = (code: string, message = code.replace(/_/gu, ' ')): DataError => ({
    kind: 'protocol',
    code,
    message,
    details: [{ message, extensions: { code } }],
  });
  const sqlRefusal = (message: string): DataError => ({ kind: 'sent', code: 'permission-error', message, details: [{ message, extensions: { code: 'permission-error' } }] });

  it('should read the tester refusals as sentences, and leave unknown codes alone', async () => {
    for (const [code, text] of [
      ['mode_not_allowed', /may not use this mode/],
      ['application_inactive', /not active/],
      ['access_point_required', /choose one of its doors/],
      ['file_not_found', /frame could not be read/],
    ] as const) {
      await expect(failing(actionRefusal(code)).mutations?.custom?.(call('authenticateFace'), {} as never)).rejects.toMatchObject({
        kind: 'validation',
        details: { issues: [{ message: { default: expect.stringMatching(text) } }] },
      });
    }
    await expect(
      failing(actionRefusal('invalid_sequence', 'frames[1] is not a JPEG or PNG image')).mutations?.custom?.(call('authenticateFace'), {} as never),
    ).rejects.toMatchObject({ details: { issues: [{ message: { default: expect.stringMatching(/frames\[1\] is not a JPEG/) } }] } });
    await expect(failing(actionRefusal('timeout')).mutations?.custom?.(call('authenticateFace'), {} as never)).rejects.toMatchObject({ kind: 'protocol' });
  });

  it('should read a review someone else already decided as a sentence', async () => {
    await expect(
      failing(sqlRefusal('Check constraint violation. auth_attempt_not_pending')).mutations?.custom?.(call('reviewAuthenticationAttempt'), {} as never),
    ).rejects.toMatchObject({ kind: 'validation', code: 'auth_attempt_not_pending' });
  });
});
