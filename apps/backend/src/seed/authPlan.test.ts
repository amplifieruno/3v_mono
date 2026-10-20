import { describe, expect, it } from 'vitest';
import { AUTH_APPS } from './authAppsPlan.js';
import { AUTH_WINDOWS, planAuthHistory, SCENARIOS, type AuthFlowPlan } from './authPlan.js';
import { localDate, localMinutes, weekday } from './historyTime.js';

const TZ = 'Europe/Moscow';
// Tuesday 2026-10-20 07:00 Moscow.
const NOW = Date.parse('2026-10-20T04:00:00Z');
const DAY = 86_400_000;
const plan = planAuthHistory({ now: NOW, timezone: TZ });
const of = (app: string): AuthFlowPlan[] => plan.filter((f) => f.app === app);

describe('planAuthHistory', () => {
  it('should be deterministic and ordered by time', () => {
    expect(planAuthHistory({ now: NOW, timezone: TZ })).toEqual(plan);
    for (let i = 1; i < plan.length; i += 1) expect(plan[i].at).toBeGreaterThanOrEqual(plan[i - 1].at);
    plan.forEach((f, i) => expect(f.index).toBe(i));
  });

  it('should place every session on a weekday inside its app window, within the last 30 days and before the live hour', () => {
    for (const f of plan) {
      expect(weekday(localDate(f.at, TZ)), f.app).toBeLessThanOrEqual(5);
      const minutes = localMinutes(f.at, TZ);
      expect(AUTH_WINDOWS[f.app].some(([from, to]) => minutes >= from && minutes < to), `${f.app} ${minutes}`).toBe(true);
      expect(f.at).toBeGreaterThanOrEqual(NOW - 30 * DAY);
      expect(f.at + 5 * 60_000).toBeLessThan(NOW - 3_600_000);
    }
  });

  it('should keep a plausible volume per weekday and app', () => {
    const perDay = new Map<string, number>();
    for (const f of plan) perDay.set(`${f.app}/${localDate(f.at, TZ)}`, (perDay.get(`${f.app}/${localDate(f.at, TZ)}`) ?? 0) + 1);
    const days = new Set(plan.map((f) => localDate(f.at, TZ)));
    expect(days.size).toBeGreaterThanOrEqual(20);
    for (const [key, n] of perDay) {
      const app = key.split('/')[0] as keyof typeof AUTH_WINDOWS;
      expect(n, key).toBeLessThanOrEqual({ lobby: 16, hr: 6, visitor: 4, sandbox: 5 }[app]);
    }
    expect(plan.length).toBeGreaterThan(400);
    expect(plan.length).toBeLessThan(800);
    expect(plan.some((f) => !AUTH_APPS[f.app].keyed)).toBe(false);
  });

  it('should contain every scenario of every app and every quality failure reason', () => {
    for (const app of ['lobby', 'hr', 'visitor', 'sandbox'] as const) {
      const scenarios = new Set(of(app).map((f) => f.scenario));
      for (const s of SCENARIOS[app]) expect(scenarios.has(s), `${app} ${s}`).toBe(true);
    }
    const reasons = new Set(plan.flatMap((f) => f.steps.flatMap((s) => (s.kind === 'decide' && s.quality ? [s.quality] : []))));
    expect([...reasons].sort()).toEqual(['blur', 'low_quality', 'multiple_faces', 'no_face', 'poor_lighting']);
  });

  it('should use the modes of each app, second factors only in verification', () => {
    for (const f of plan) {
      expect(AUTH_APPS[f.app].modes).toContain(f.mode);
      if (f.steps.some((s) => s.kind === 'second_factor')) expect(f.mode).toBe('verification');
      if (f.scenario === 'review') expect(f.mode).toBe('identification');
    }
    expect(new Set(of('sandbox').map((f) => f.mode))).toEqual(new Set(['identification', 'verification']));
  });

  it('should keep every session within its 5-minute lifetime and at most three captures', () => {
    for (const f of plan) {
      let last = 0;
      for (const s of f.steps) {
        expect(s.offsetMs).toBeGreaterThan(last);
        last = s.offsetMs;
      }
      expect(last).toBeLessThan(5 * 60_000);
      expect(f.steps.filter((s) => s.kind === 'decide').length).toBeLessThanOrEqual(3);
    }
  });

  it('should replay the sequence of an earlier successful session of the same app', () => {
    const replays = plan.filter((f) => f.scenario === 'replay');
    expect(replays.length).toBeGreaterThanOrEqual(2);
    for (const f of replays) {
      const original = f.replayOf === null ? undefined : plan[f.replayOf];
      expect(original?.app).toBe(f.app);
      expect(original?.scenario).toBe('success');
      expect(original?.at ?? Infinity).toBeLessThan(f.at);
    }
  });

  it('should approve and reject earlier reviews and leave the latest pending', () => {
    const reviews = plan.filter((f) => f.scenario === 'review');
    const decided = reviews.filter((f) => f.review !== null);
    expect(decided.some((f) => f.review?.approve)).toBe(true);
    expect(decided.some((f) => f.review && !f.review.approve)).toBe(true);
    expect(reviews.length - decided.length).toBeGreaterThanOrEqual(2);
    expect(reviews[reviews.length - 1].review).toBeNull();
    for (const f of decided) {
      expect(f.review?.at ?? 0).toBeGreaterThan(f.at + 10 * 60_000);
      expect(f.review?.at ?? Infinity).toBeLessThan(NOW - 3_600_000);
    }
  });

  it('should keep evidence for a few failed captures only', () => {
    const evidence = plan.flatMap((f) => f.steps.filter((s) => s.kind === 'decide' && s.evidence).map((s) => ({ f, s })));
    expect(evidence.length).toBeGreaterThanOrEqual(5);
    expect(evidence.length).toBeLessThanOrEqual(10);
    for (const { s } of evidence) {
      if (s.kind !== 'decide') continue;
      const cleanMatch = s.probe === 'match' && s.quality === null && s.attack === 'passed';
      expect(cleanMatch).toBe(false);
    }
  });

  it('should narrow visitor sessions to the reception access point only in the not_retrieved scenario', () => {
    for (const f of of('visitor')) expect(f.accessPoint !== null).toBe(f.scenario === 'not_retrieved');
    for (const f of of('lobby')) expect(f.accessPoint).toMatch(/^Turnstile [1-3]$/);
    for (const f of [...of('hr'), ...of('sandbox')]) expect(f.accessPoint).toBeNull();
  });
});
