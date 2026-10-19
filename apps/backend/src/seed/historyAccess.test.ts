import { describe, expect, it } from 'vitest';
import { fireDrill, CONTRACTOR_WINDOW_START } from './historyAccess.js';
import { FIXTURE_NOW, FIXTURE_TZ, fixtureInput } from './historyFixture.js';
import { buildHistoryPlan } from './historyPlan.js';
import { localDate, localMinutes, weekday } from './historyTime.js';

const TZ = FIXTURE_TZ;
const local = (at: number) => ({ date: localDate(at, TZ), minutes: localMinutes(at, TZ) });
const isTurnstile = (point: string): boolean => point.startsWith('turnstile');

describe('history access scenarios (slice 8 seed)', () => {
  const input = fixtureInput();
  const plan = buildHistoryPlan(input);
  const today = localDate(FIXTURE_NOW.getTime(), TZ);
  const drill = fireDrill(today, TZ);

  it('should place the fire drill on a weekday afternoon inside the replay, 20 minutes long', () => {
    expect(weekday(drill.date)).toBeLessThanOrEqual(5);
    expect(local(drill.start)).toEqual({ date: drill.date, minutes: 14 * 60 + 30 });
    expect(drill.end - drill.start).toBe(20 * 60_000);
    expect(drill.start).toBeGreaterThan(plan.days[0].start);
    expect(drill.end).toBeLessThan(plan.days[plan.days.length - 1].end);
  });

  it('should evacuate office employees through the turnstiles during the drill and bring them back after it', () => {
    const during = plan.detections.filter((d) => isTurnstile(d.point) && d.at >= drill.start && d.at < drill.end);
    const office = new Set(input.people.filter((p) => p.role === 'employee' && !p.guard && !p.night).map((p) => p.identityId));
    const evacuated = new Set(during.filter((d) => office.has(d.identityId)).map((d) => d.identityId));
    expect(evacuated.size).toBeGreaterThanOrEqual(4);
    for (const id of evacuated) {
      const back = plan.detections.find((d) => d.identityId === id && isTurnstile(d.point) && d.at >= drill.end && d.at < drill.end + 15 * 60_000);
      expect(back, id).toBeDefined();
    }
  });

  it('should let one unknown face follow a known employee through the same turnstile within two seconds (tailgating)', () => {
    const turnstile = plan.detections.filter((d) => isTurnstile(d.point));
    const tailgaters = turnstile.filter((d) => d.identityId.startsWith('u-'));
    expect(tailgaters).toHaveLength(1);
    const [tail] = tailgaters;
    const leader = turnstile.find((d) => d.point === tail.point && d.identityId.startsWith('id-') && tail.at - d.at > 0 && tail.at - d.at <= 2_000);
    expect(leader).toBeDefined();
    expect(weekday(local(tail.at).date)).toBeLessThanOrEqual(5);
    expect(tail.identityId).not.toBe(input.watchedIdentity);
  });

  it('should bring the active contractor early: three turnstile attempts before the window, one right after, one later, then the way out', () => {
    const contractor = 'id-102';
    const days = new Map<string, number[]>();
    for (const d of plan.detections.filter((x) => x.identityId === contractor && isTurnstile(x.point))) {
      const { date } = local(d.at);
      days.set(date, [...(days.get(date) ?? []), d.at]);
    }
    const early = [...days.values()].find((times) => times.length >= 6 && local(times[0]).minutes < CONTRACTOR_WINDOW_START);
    expect(early).toBeDefined();
    const times = (early ?? []).slice(0, 5);
    const minutes = times.map((t) => local(t).minutes);
    expect(minutes.slice(0, 3).every((m) => m < CONTRACTOR_WINDOW_START)).toBe(true);
    expect(minutes[3]).toBeGreaterThanOrEqual(CONTRACTOR_WINDOW_START);
    // Three attempts in the 10 minutes before the fourth (risk 3 x 0.15), none in the 10 minutes before the fifth.
    expect(times.slice(0, 3).every((t) => times[3] - t <= 10 * 60_000)).toBe(true);
    expect(times[4] - times[3]).toBeGreaterThan(10 * 60_000);
    // Nothing else of the contractor that day besides the entrance (in and out) and the turnstile on the way out.
    const date = local(times[0]).date;
    const other = plan.detections.filter((d) => d.identityId === contractor && local(d.at).date === date && !isTurnstile(d.point));
    expect(other.every((d) => d.point === 'entrance')).toBe(true);
  });

  it('should let the terminated contractor try a turnstile once after reception', () => {
    const seen = plan.detections.filter((d) => d.identityId === 'id-105');
    expect([...new Set(seen.map((d) => (isTurnstile(d.point) ? 'turnstile' : d.point)))]).toEqual(['entrance', 'reception', 'turnstile']);
    expect(seen.filter((d) => isTurnstile(d.point))).toHaveLength(1);
  });
});
