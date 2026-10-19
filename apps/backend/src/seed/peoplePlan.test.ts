import { describe, expect, it } from 'vitest';
import { SEED_COMPANIES } from './companies.js';
import { buildPeople } from './peoplePlan.js';

const NOW = new Date('2026-10-19T09:00:00Z');

describe('buildPeople', () => {
  it('should plan 150 Nova Tower people with the requested mix', () => {
    const people = buildPeople('nova', NOW);
    expect(people).toHaveLength(150);
    const roles = people.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.role]: (acc[p.role] ?? 0) + 1 }), {});
    expect(roles.vip).toBe(3);
    expect(roles.blacklisted).toBe(1);
    expect(roles.employee).toBeGreaterThan(75);
    expect(roles.contractor).toBeGreaterThan(0);
    expect(roles.visitor).toBeGreaterThan(0);
  });

  it('should be deterministic with unique keys, names and emails', () => {
    const a = buildPeople('nova', NOW);
    expect(buildPeople('nova', NOW)).toEqual(a);
    expect(new Set(a.map((p) => p.externalId)).size).toBe(a.length);
    expect(new Set(a.map((p) => `${p.profile.first_name} ${p.profile.last_name}`)).size).toBe(a.length);
    const emails = a.map((p) => p.profile.email).filter(Boolean);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it('should only reference seeded companies and keep dates ordered and relative to now', () => {
    const names = new Set(SEED_COMPANIES.nova.map((c) => c.name));
    for (const p of buildPeople('nova', NOW)) {
      if (p.company) expect(names.has(p.company)).toBe(true);
      if (p.profile.start_date) expect(p.profile.start_date <= '2026-10-19').toBe(true);
      if (p.profile.start_date && p.profile.end_date) expect(p.profile.end_date >= p.profile.start_date).toBe(true);
    }
  });

  it('should grant biometric consent to most people and withdraw it for exactly two', () => {
    const people = buildPeople('nova', NOW);
    const biometric = people.flatMap((p) => p.consents.filter((c) => c.purpose === 'biometric_processing'));
    expect(biometric.filter((c) => c.status === 'granted').length).toBeGreaterThan(people.length / 2);
    const withdrawn = people.filter((p) => p.consents.some((c) => c.status === 'withdrawn'));
    expect(withdrawn).toHaveLength(2);
    // Withdrawn people are never given a face (faces go to employees, VIPs and the blacklisted person).
    for (const p of withdrawn) expect(['employee', 'vip', 'blacklisted']).not.toContain(p.role);
  });

  it('should plan a small Riverside subset with different names', () => {
    const riverside = buildPeople('riverside', NOW);
    expect(riverside.length).toBeGreaterThan(5);
    expect(riverside.length).toBeLessThan(30);
    const names = new Set(SEED_COMPANIES.riverside.map((c) => c.name));
    for (const p of riverside) if (p.company) expect(names.has(p.company)).toBe(true);
  });

  it('should attach a few documents', () => {
    const docs = buildPeople('nova', NOW).filter((p) => p.document);
    expect(docs.length).toBeGreaterThanOrEqual(3);
    expect(docs.length).toBeLessThanOrEqual(12);
  });
});
