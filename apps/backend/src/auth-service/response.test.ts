import { describe, expect, it } from 'vitest';
import type { StorageClient } from '../storage/storageClient.js';
import { authenticationResponse, nextStep, publicAttributes } from './response.js';
import { sessionStatusResponse } from './status.js';
import type { PublicDecision, SessionState } from './store.js';

const storage = {
  presignedUrl: async (id: string) => ({ url: `https://files.example/${id}?sig=x`, expiresAt: new Date('2030-01-01T00:00:00Z') }),
} as unknown as StorageClient;

const decision = (extra: Partial<PublicDecision>): PublicDecision => ({
  attempt_id: 'a1',
  session_id: 's1',
  outcome: 'failure',
  matched_identity_id: null,
  confidence: null,
  threshold_used: 0.6,
  failure_reason: 'below_threshold',
  attack_outcome: 'passed',
  attributes: {},
  session_status: 'failed',
  session_step: 'initial',
  step_count: 1,
  recapture_count: 0,
  expires_at: '2030-01-01T00:00:00Z',
  ...extra,
});

describe('public authentication response', () => {
  it('should carry identity, confidence and translated attributes only for success', async () => {
    const body = await authenticationResponse('r1', decision({
      outcome: 'success', matched_identity_id: 'i1', confidence: 0.91, failure_reason: null, session_status: 'succeeded',
      attributes: { display_name: 'Ada', photo: 'f1' },
    }), storage, 'identification');
    expect(body).toMatchObject({ outcome: 'success', authenticated: true, confidence: 0.91, next_step: 'none' });
    expect(body.identity).toEqual({ id: 'i1', attributes: { display_name: 'Ada', photo: { url: 'https://files.example/f1?sig=x', expires_at: '2030-01-01T00:00:00.000Z' } } });
  });

  it('should never expose a candidate or score for partial matches and failures', async () => {
    const partial = await authenticationResponse('r1', decision({ outcome: 'partial_match', matched_identity_id: 'i1', confidence: 0.55, session_status: 'open', failure_reason: null }), storage, 'identification');
    expect(partial.identity).toBeUndefined();
    expect(partial.confidence).toBeUndefined();
    expect(partial).toMatchObject({ failure: { code: 'partial_match', retryable: true }, next_step: 'recapture' });
    const failure = await authenticationResponse('r1', decision({ matched_identity_id: 'i1', confidence: 0.3 }), storage, 'identification');
    expect(failure.identity).toBeUndefined();
    expect(failure.confidence).toBeUndefined();
    expect(failure).toMatchObject({ failure: { code: 'below_threshold', retryable: false }, next_step: 'none' });
  });

  it('should map unknown reasons to below_threshold and keep quality failures retryable while open', async () => {
    expect((await authenticationResponse('r', decision({ failure_reason: 'not_retrieved' }), storage, 'identification')).failure?.code).toBe('below_threshold');
    const blur = await authenticationResponse('r', decision({ failure_reason: 'blur', session_status: 'open' }), storage, 'identification');
    expect(blur).toMatchObject({ failure: { code: 'blur', retryable: true }, next_step: 'recapture' });
    expect(blur.failure?.guidance).toMatch(/steady/);
  });

  it('should choose the next step of a partial match by recaptures used and review', () => {
    // Verification: the second factor is offered from the first partial match on (recapture still accepted), as the
    // SQL accepts it after any partial match of an open verification session.
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 0 }, 'verification')).toBe('second_factor');
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 0 }, 'identification')).toBe('recapture');
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 1 }, 'verification')).toBe('second_factor');
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 1 }, 'identification')).toBe('recapture');
    expect(nextStep({ outcome: 'partial_match', session_status: 'review', recapture_count: 2 }, 'identification')).toBe('review');
    expect(nextStep({ outcome: 'success', session_status: 'succeeded', recapture_count: 0 }, 'verification')).toBe('none');
  });

  it('should null a photo that cannot be signed and leave other attributes untouched', async () => {
    const failing = { presignedUrl: async () => { throw new Error('down'); } } as unknown as StorageClient;
    expect(await publicAttributes({ photo: 'f1', company: 'Acme' }, failing)).toEqual({ photo: null, company: 'Acme' });
    expect(await publicAttributes({ company: null }, failing)).toEqual({ company: null });
  });
});

describe('session status response', () => {
  const state = (extra: Partial<SessionState>): SessionState => ({
    session_id: 's1', mode: 'identification', status: 'open', step: 'initial', step_count: 0, recapture_count: 0,
    expires_at: '2030-01-01T00:00:00Z', last_outcome: null, last_failure_reason: null, review_status: null,
    matched_identity_id: null, attributes: {}, ...extra,
  });
  const next = async (extra: Partial<SessionState>) => (await sessionStatusResponse('r', state(extra), storage)).next_step;

  it('should tell the next step of a polled session', async () => {
    expect(await next({})).toBe('capture');
    expect(await next({ step_count: 1, step: 'recapture', last_outcome: 'failure', last_failure_reason: 'blur' })).toBe('recapture');
    expect(await next({ step_count: 1, last_outcome: 'partial_match' })).toBe('recapture');
    expect(await next({ step_count: 1, last_outcome: 'partial_match', mode: 'verification' })).toBe('second_factor');
    expect(await next({ status: 'review', step_count: 3, last_outcome: 'partial_match' })).toBe('review');
    expect(await next({ status: 'failed', step_count: 1, last_outcome: 'failure' })).toBe('none');
    expect(await next({ status: 'expired' })).toBe('none');
  });
});
