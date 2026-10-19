import { describe, expect, it } from 'vitest';
import { replayDecision } from './historyReplay.js';

describe('replayDecision', () => {
  it('should replay an organization without tracking data', () => {
    expect(replayDecision({ seeded: false, newerData: false })).toBe('replay');
  });

  it('should skip an organization that already has its history', () => {
    expect(replayDecision({ seeded: true, newerData: true })).toBe('seeded');
  });

  it('should refuse a partial history when tracking data exists but no history marker', () => {
    expect(replayDecision({ seeded: false, newerData: true })).toBe('needs_reset');
  });
});
