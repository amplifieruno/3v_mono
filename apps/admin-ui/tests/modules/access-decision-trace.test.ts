import { describe, expect, it } from 'vitest';
import { formatRisk, traceOf } from '../../src/modules/access/decision-trace-format';

/**
 * The decision trace read from `access_decisions.signals` (Review Focus 5) for the shapes the
 * engine writes: a grant, an evacuation override, a policy deny among outranked and non-matching
 * versions, an allow refused for risk, an unknown face, an older trace (`used` for `applied`) and
 * partial or malformed traces, which read without failing.
 */

const RISK_ZERO = { score: 0, components: { device_health: 0, over_capacity: 0, recent_denials: 0, unknown_identity: 0 } };
const PERSON = { profile_id: 'p1', identity_id: 'i1', access_level: 'basic', profile_type: 'visitor', profile_status: 'active' };
const candidate = (extra: Record<string, unknown>) => ({
  version_id: 'v',
  policy_id: 'p',
  effect: 'allow',
  priority: 100,
  max_risk: null,
  subject: 'profile',
  target: 'access_point',
  valid: true,
  schedule: 'always',
  matched: true,
  decided: false,
  simulated: false,
  ...extra,
});

describe('decision trace', () => {
  it('should read a grant decision: versions that did not apply and the grant that decided', () => {
    const trace = traceOf({
      decided_by: 'grant',
      epoch: 35,
      timezone: 'Europe/Moscow',
      person: PERSON,
      overrides: [],
      candidates: [candidate({ version_id: 'a', subject: null, target: null }), candidate({ version_id: 'b', target: null }), candidate({ version_id: 'c', schedule: 'out' })],
      grants: [{ id: 'g1', single_use: true, applied: true, consumed: true }],
      signals: { recent_denials: 0, device_health: 'healthy', ignored_device_id: null, areas_over_capacity: [] },
      risk: RISK_ZERO,
    });
    expect(trace?.decidedBy).toBe('grant');
    expect(trace?.candidates.map((c) => c.outcome)).toEqual(['notThePerson', 'notTheDoor', 'outsideSchedule']);
    expect(trace?.grants).toEqual([{ id: 'g1', singleUse: true, applied: true, consumed: true }]);
    expect(trace?.person).toEqual({ known: true, status: 'active', type: 'visitor', level: 'basic' });
    expect(trace?.riskParts).toEqual([]);
  });

  it('should read an evacuation that decided while a lock was skipped', () => {
    const trace = traceOf({
      decided_by: 'override',
      overrides: [
        { id: 'o1', mode: 'evacuation', applied: true },
        { id: 'o2', mode: 'lock_all', applied: false },
      ],
      candidates: [],
      grants: [],
      person: PERSON,
      risk: RISK_ZERO,
    });
    expect(trace?.overrides).toEqual([
      { id: 'o1', mode: 'evacuation', applied: true },
      { id: 'o2', mode: 'lock_all', applied: false },
    ]);
    expect(trace?.candidates).toEqual([]);
  });

  it('should read a policy deny that outranked a matching allow', () => {
    const trace = traceOf({
      decided_by: 'policy',
      person: PERSON,
      candidates: [candidate({ version_id: 'deny', effect: 'deny', priority: 400, decided: true }), candidate({ version_id: 'allow', schedule: 'in' })],
      risk: RISK_ZERO,
    });
    expect(trace?.candidates.map((c) => [c.versionId, c.outcome])).toEqual([
      ['deny', 'decided'],
      ['allow', 'outranked'],
    ]);
  });

  it('should read an allow refused for risk with what added to it, unknown and crowded', () => {
    const trace = traceOf({
      decided_by: 'policy',
      person: { profile_id: null, identity_id: 'i9', profile_status: null, profile_type: null, access_level: null },
      candidates: [candidate({ max_risk: 0.4, decided: true, valid: true })],
      signals: { recent_denials: 2, device_health: 'warning', ignored_device_id: 'd7', areas_over_capacity: [{ area_id: 'a1', occupancy: 30, capacity: 25 }] },
      risk: { score: 1, components: { device_health: 0.15, over_capacity: 0.3, recent_denials: 0.3, unknown_identity: 0.4 } },
    });
    expect(trace?.person.known).toBe(false);
    expect(trace?.candidates[0]?.maxRisk).toBe(0.4);
    expect(trace?.riskParts).toEqual([
      { key: 'unknown_identity', value: 0.4 },
      { key: 'recent_denials', value: 0.3 },
      { key: 'over_capacity', value: 0.3 },
      { key: 'device_health', value: 0.15 },
    ]);
    expect(trace?.overCapacityAreaIds).toEqual(['a1']);
    expect(trace?.recentDenials).toBe(2);
    expect(trace?.ignoredDevice).toBe(true);
    expect(formatRisk(trace?.riskScore ?? null)).toBe('1.00');
  });

  it('should read an unknown face refused before any policy, with no lists', () => {
    const trace = traceOf({ decided_by: 'person', person: { profile_id: null }, risk: { score: 0.4, components: { unknown_identity: 0.4 } } });
    expect(trace).toMatchObject({ decidedBy: 'person', overrides: [], candidates: [], grants: [], recentDenials: 0, deviceHealth: null });
    expect(trace?.riskParts).toEqual([{ key: 'unknown_identity', value: 0.4 }]);
  });

  it('should read an older trace whose grants say used, and tolerate malformed parts', () => {
    const trace = traceOf({
      decided_by: 'grant',
      grants: [{ id: 'g', single_use: false, used: true }],
      candidates: 'not a list',
      risk: { score: 'high' },
    });
    expect(trace?.grants[0]).toMatchObject({ applied: true, consumed: false });
    expect(trace?.candidates).toEqual([]);
    expect(trace?.riskScore).toBeNull();
    expect(formatRisk(null)).toBe('—');
  });

  it('should read nothing from a value that is no object', () => {
    expect(traceOf(null)).toBeNull();
    expect(traceOf('{}')).toBeNull();
    expect(traceOf([])).toBeNull();
    expect(traceOf({})).toMatchObject({ decidedBy: null, candidates: [] });
  });
});
