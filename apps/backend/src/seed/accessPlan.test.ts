import { describe, expect, it } from 'vitest';
import { historyPolicies, livePolicies, maintenanceGrant, POLICY_NAMES, riversidePolicies, visitGrants } from './accessPlan.js';
import { FIXTURE_NOW, FIXTURE_TZ, fixtureInput } from './historyFixture.js';
import { buildHistoryPlan } from './historyPlan.js';
import { localDate, localMinutes, weekday } from './historyTime.js';

const TZ = FIXTURE_TZ;
const NOW = FIXTURE_NOW.getTime();

describe('accessPlan', () => {
  const all = [...historyPolicies(), ...livePolicies(), ...riversidePolicies()];

  it('should give every policy at least one subject and one target, and unique names', () => {
    for (const p of all) {
      expect(p.subjects.length, p.name).toBeGreaterThan(0);
      expect(p.targets.length, p.name).toBeGreaterThan(0);
    }
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
  });

  it('should publish the history policies and keep exactly one pending and one draft among the live ones', () => {
    expect(historyPolicies().every((p) => p.stage === 'published')).toBe(true);
    expect(livePolicies().map((p) => p.stage).sort()).toEqual(['draft', 'pending', 'published']);
  });

  it('should let the server room IT allow decide before the deny for everyone else', () => {
    const itAllow = historyPolicies().find((p) => p.name === POLICY_NAMES.serverRoomIt);
    const others = historyPolicies().find((p) => p.name === POLICY_NAMES.serverRoomOthers);
    expect(itAllow?.effect).toBe('allow');
    expect(others?.effect).toBe('deny');
    expect(itAllow?.priority ?? 0).toBeGreaterThan(others?.priority ?? 0);
    expect(others?.subjects).toHaveLength(4);
  });

  it('should keep the office-hours windows wide and the contractors under a risk limit', () => {
    const employees = historyPolicies().find((p) => p.name === POLICY_NAMES.employees);
    expect(employees?.schedule).toEqual([{ days: [1, 2, 3, 4, 5], from: '06:00', to: '22:00' }]);
    const contractors = historyPolicies().find((p) => p.name === POLICY_NAMES.contractors);
    expect(contractors?.maxRisk).toBe(0.4);
    expect(contractors?.schedule?.[0]?.from).toBe('07:30');
  });

  it('should plan one day grant per visit that was not cancelled, exactly one single-use on a tracked checked-out visit', () => {
    const plan = buildHistoryPlan(fixtureInput());
    const grants = visitGrants(plan.visits, TZ, NOW);
    const kept = plan.visits.filter((v) => v.status !== 'cancelled');
    expect(grants).toHaveLength(kept.length);
    expect(grants.filter((g) => g.singleUse)).toHaveLength(1);
    kept.forEach((v, i) => {
      const g = grants[i];
      expect(g.profileId).toBe(v.visitorProfileId);
      expect(g.validFrom).toBeLessThanOrEqual(v.expectedStart);
      expect(g.validUntil).toBeGreaterThanOrEqual(v.expectedEnd);
      expect(localMinutes(g.validFrom, TZ)).toBe(7 * 60);
      expect(localMinutes(g.validUntil, TZ)).toBe(21 * 60);
      // The whole tracked visit lies inside its grant.
      if (v.checkedInAt) expect(v.checkedInAt).toBeGreaterThanOrEqual(g.validFrom);
      if (v.checkedOutAt) expect(v.checkedOutAt).toBeLessThanOrEqual(g.validUntil);
      expect(g.createdAt).toBeLessThanOrEqual(NOW);
    });
    const single = plan.visits.find((v) => v.status === 'checked_out' && v.identityId);
    expect(grants[kept.indexOf(single ?? kept[0])]?.singleUse).toBe(true);
  });

  it('should put the revoked maintenance slot on a future weekday morning', () => {
    const slot = maintenanceGrant(localDate(NOW, TZ), TZ);
    expect(slot.validFrom).toBeGreaterThan(NOW);
    expect(weekday(localDate(slot.validFrom, TZ))).toBeLessThanOrEqual(5);
    expect(slot.validUntil - slot.validFrom).toBe(3 * 3_600_000);
  });
});
