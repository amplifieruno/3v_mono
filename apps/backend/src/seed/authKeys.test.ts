import { describe, expect, it } from 'vitest';
import { historyKeyOf } from './authKeys.js';

const key = (id: string, extra: { revoked_at?: string | null; expires_at?: string | null } = {}) => ({
  id, revoked_at: null, expires_at: null, ...extra,
});

describe('historyKeyOf', () => {
  it('should seed new keys when the app has none', () => {
    expect(historyKeyOf([])).toEqual({ kind: 'seed' });
  });

  it('should reuse the revoked history key of a completed seed', () => {
    const keys = [key('pilot', { expires_at: '2026-01-01T00:00:00Z' }), key('history', { revoked_at: '2026-10-20T00:00:00Z' }), key('current')];
    expect(historyKeyOf(keys)).toEqual({ kind: 'existing', id: 'history' });
  });

  it('should fall back to the oldest non-expiring key after an interrupted seed (never no key)', () => {
    expect(historyKeyOf([key('pilot', { expires_at: '2026-01-01T00:00:00Z' }), key('history'), key('current')])).toEqual({
      kind: 'recovered',
      id: 'history',
    });
    expect(historyKeyOf([key('pilot', { expires_at: '2026-01-01T00:00:00Z' })])).toEqual({ kind: 'recovered', id: 'pilot' });
  });
});
