import { describe, expect, it } from 'vitest';
import {
  QUERY_RETRIES,
  createItapQueryClient,
  isRetryableError,
} from '../../src/data/query-client';

describe('isRetryableError', () => {
  it.each(['capability', 'validation', 'forbidden', 'not-found', 'cancelled', 'configuration'])(
    'should not retry a %s error',
    (kind) => {
      expect(isRetryableError({ kind })).toBe(false);
    },
  );

  it('should not retry a 4xx other than 429', () => {
    expect(isRetryableError({ kind: 'network', status: 404 })).toBe(false);
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('should retry network failures, 5xx and unknown values', () => {
    expect(isRetryableError({ kind: 'network' })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError(new Error('boom'))).toBe(true);
    expect(isRetryableError('boom')).toBe(true);
  });
});

describe('createItapQueryClient', () => {
  it('should stop retrying after the limit and never retry mutations', () => {
    const client = createItapQueryClient();
    const { queries, mutations } = client.getDefaultOptions();
    const retry = queries?.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, { status: 503 })).toBe(true);
    expect(retry(QUERY_RETRIES, { status: 503 })).toBe(false);
    expect(retry(0, { kind: 'forbidden' })).toBe(false);
    expect(mutations?.retry).toBe(false);
  });
});
