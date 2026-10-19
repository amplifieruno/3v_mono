import type { HistoryInput, HistoryPerson } from './historyPlan.js';

/**
 * A small deterministic history input for the plan unit tests (historyPlan.test, historyAccess.test): 60 office
 * employees, the security chief and a guard, two contractors (one active, one whose contract ended), two VIPs, two
 * night-shift people, visitors on seven dates and three unknown faces (one watched).
 */
export const FIXTURE_TZ = 'Europe/Moscow';
export const FIXTURE_NOW = new Date('2026-10-19T09:17:00Z');
export const FIXTURE_NIGHT = new Set(['id-110', 'id-111']);

export function fixturePerson(n: number, extra: Partial<HistoryPerson> = {}): HistoryPerson {
  return {
    identityId: `id-${n}`,
    profileId: `p-${n}`,
    role: 'employee',
    clearance: n % 5 === 0 ? 'basic' : 'standard',
    car: n % 3 === 0,
    dockDuty: n % 7 === 0 && n % 5 !== 0,
    guard: null,
    night: false,
    activeFrom: null,
    activeTo: null,
    ...extra,
  };
}

export function fixtureInput(): HistoryInput {
  const person = fixturePerson;
  const people: HistoryPerson[] = Array.from({ length: 60 }, (_, i) => person(i + 1));
  people.push(person(100, { guard: 'chief', clearance: 'elevated' }), person(101, { guard: 'guard' }));
  people.push(person(102, { role: 'contractor', clearance: 'basic', activeFrom: '2026-09-01', activeTo: '2027-01-01' }));
  people.push(person(103, { role: 'vip', clearance: 'elevated', car: true }), person(104, { role: 'vip', clearance: 'elevated' }));
  people.push(person(105, { role: 'contractor', clearance: 'basic', activeFrom: '2026-01-10', activeTo: '2026-09-09' }));
  people.push(person(110, { night: true }), person(111, { night: true, guard: 'guard' }));
  const visitDates = ['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-11', '2026-10-14', '2026-10-16', '2026-10-19'];
  return {
    now: FIXTURE_NOW,
    timezone: FIXTURE_TZ,
    people,
    visitors: visitDates.map((visitDate, i) => ({ profileId: `v-${i}`, identityId: i % 2 === 0 ? `vid-${i}` : null, visitDate })),
    hosts: [{ profileId: 'p-1', companyId: 'c-1' }, { profileId: 'p-2', companyId: 'c-2' }],
    blacklistedIdentity: 'bl',
    unknownIdentities: ['u-1', 'u-2', 'u-3'],
    watchedIdentity: 'u-1',
    terminatedIdentity: 'id-105',
  };
}
