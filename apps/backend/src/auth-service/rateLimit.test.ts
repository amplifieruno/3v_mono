import { describe, expect, it } from 'vitest';
import { TokenBuckets } from './rateLimit.js';

describe('TokenBuckets', () => {
  it('should allow a burst, refuse beyond it and refill over time, per key', () => {
    let now = 0;
    const buckets = new TokenBuckets(3, 1, () => now);
    expect([1, 2, 3].map(() => buckets.take('k'))).toEqual([true, true, true]);
    expect(buckets.take('k')).toBe(false);
    expect(buckets.retryAfter('k')).toBe(1);
    expect(buckets.take('other')).toBe(true);
    now = 1000;
    expect(buckets.take('k')).toBe(true);
    expect(buckets.take('k')).toBe(false);
  });
});
