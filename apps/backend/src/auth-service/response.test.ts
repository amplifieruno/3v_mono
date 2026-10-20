import { describe, expect, it } from 'vitest';
import type { StorageClient } from '../storage/storageClient.js';
import { authenticationResponse, nextStep, publicAttributes } from './response.js';
import type { PublicDecision } from './store.js';

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
    }), storage);
    expect(body).toMatchObject({ outcome: 'success', authenticated: true, confidence: 0.91, next_step: 'none' });
    expect(body.identity).toEqual({ id: 'i1', attributes: { display_name: 'Ada', photo: { url: 'https://files.example/f1?sig=x', expires_at: '2030-01-01T00:00:00.000Z' } } });
  });

  it('should never expose a candidate or score for partial matches and failures', async () => {
    const partial = await authenticationResponse('r1', decision({ outcome: 'partial_match', matched_identity_id: 'i1', confidence: 0.55, session_status: 'open', failure_reason: null }), storage);
    expect(partial.identity).toBeUndefined();
    expect(partial.confidence).toBeUndefined();
    expect(partial).toMatchObject({ failure: { code: 'partial_match', retryable: true }, next_step: 'recapture' });
    const failure = await authenticationResponse('r1', decision({ matched_identity_id: 'i1', confidence: 0.3 }), storage);
    expect(failure.identity).toBeUndefined();
    expect(failure.confidence).toBeUndefined();
    expect(failure).toMatchObject({ failure: { code: 'below_threshold', retryable: false }, next_step: 'none' });
  });

  it('should map unknown reasons to below_threshold and keep quality failures retryable while open', async () => {
    expect((await authenticationResponse('r', decision({ failure_reason: 'not_retrieved' }), storage)).failure?.code).toBe('below_threshold');
    const blur = await authenticationResponse('r', decision({ failure_reason: 'blur', session_status: 'open' }), storage);
    expect(blur).toMatchObject({ failure: { code: 'blur', retryable: true }, next_step: 'recapture' });
    expect(blur.failure?.guidance).toMatch(/steady/);
  });

  it('should choose the next step of a partial match by recaptures used and review', () => {
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 0 })).toBe('recapture');
    expect(nextStep({ outcome: 'partial_match', session_status: 'open', recapture_count: 1 })).toBe('second_factor');
    expect(nextStep({ outcome: 'partial_match', session_status: 'review', recapture_count: 2 })).toBe('review');
    expect(nextStep({ outcome: 'success', session_status: 'succeeded', recapture_count: 0 })).toBe('none');
  });

  it('should null a photo that cannot be signed and leave other attributes untouched', async () => {
    const failing = { presignedUrl: async () => { throw new Error('down'); } } as unknown as StorageClient;
    expect(await publicAttributes({ photo: 'f1', company: 'Acme' }, failing)).toEqual({ photo: null, company: 'Acme' });
    expect(await publicAttributes({ company: null }, failing)).toEqual({ company: null });
  });
});
