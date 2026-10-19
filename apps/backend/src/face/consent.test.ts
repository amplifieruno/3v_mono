import { describe, expect, it } from 'vitest';
import { biometricConsentAllows, type BiometricConsentRow } from './consent.js';

const row = (overrides: Partial<BiometricConsentRow>): BiometricConsentRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  status: 'granted',
  granted_at: '2026-01-01T00:00:00+00:00',
  withdrawn_at: null,
  created_at: '2026-01-01T00:00:00+00:00',
  ...overrides,
});

describe('biometricConsentAllows', () => {
  it('should allow when there is no record', () => {
    expect(biometricConsentAllows([])).toBe(true);
  });

  it('should refuse when the latest record by effective time is a withdrawal', () => {
    const grant = row({ granted_at: '2026-01-01T00:00:00Z' });
    const withdrawal = row({ id: '00000000-0000-4000-8000-000000000002', status: 'withdrawn', withdrawn_at: '2026-02-01T00:00:00Z' });
    expect(biometricConsentAllows([grant, withdrawal])).toBe(false);
  });

  it('should ignore a backdated withdrawal older than a newer grant regardless of insertion order', () => {
    const withdrawal = row({ status: 'withdrawn', withdrawn_at: '2026-01-03T00:00:00Z', created_at: '2026-03-01T00:00:00Z' });
    const grant = row({ id: '00000000-0000-4000-8000-000000000002', granted_at: '2026-01-05T00:00:00Z' });
    expect(biometricConsentAllows([withdrawal, grant])).toBe(true);
  });

  it('should break effective-time ties by created_at, then id', () => {
    const at = '2026-01-05T00:00:00Z';
    const grant = row({ granted_at: at, created_at: '2026-01-05T00:00:00Z' });
    const withdrawal = row({ id: '00000000-0000-4000-8000-000000000000', status: 'withdrawn', withdrawn_at: at, created_at: '2026-01-06T00:00:00Z' });
    expect(biometricConsentAllows([grant, withdrawal])).toBe(false);
    const sameCreated = row({ id: '00000000-0000-4000-8000-000000000009', status: 'withdrawn', withdrawn_at: at });
    expect(biometricConsentAllows([row({ granted_at: at }), sameCreated])).toBe(false);
  });
});
