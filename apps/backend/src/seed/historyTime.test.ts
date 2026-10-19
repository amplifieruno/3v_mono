import { describe, expect, it } from 'vitest';
import { addDays, localDate, localMinutes, replayDays, weekday, zonedTime } from './historyTime.js';

const TZ = 'Europe/Moscow';

describe('history time helpers', () => {
  it('should convert a local wall-clock time to UTC and back', () => {
    // Moscow is UTC+3 all year.
    expect(new Date(zonedTime('2026-10-19', 9 * 60 + 30, TZ)).toISOString()).toBe('2026-10-19T06:30:00.000Z');
    expect(localDate(Date.parse('2026-10-18T22:30:00Z'), TZ)).toBe('2026-10-19');
    expect(localMinutes(Date.parse('2026-10-18T22:30:00Z'), TZ)).toBe(90);
  });

  it('should give ISO weekdays and add days across month ends', () => {
    expect(weekday('2026-10-19')).toBe(1);
    expect(weekday('2026-10-25')).toBe(7);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-10-01', -1)).toBe('2026-09-30');
  });

  it('should cover at least 30 days before now in 04:00-to-04:00 local days ending one hour before now', () => {
    const now = new Date('2026-10-19T09:17:00Z');
    const days = replayDays(now, TZ);
    const first = days[0];
    const last = days[days.length - 1];
    expect(first.start).toBeLessThanOrEqual(now.getTime() - 30 * 86_400_000);
    expect(first.start).toBeGreaterThan(now.getTime() - 33 * 86_400_000);
    expect(weekday(first.date)).not.toBe(7);
    expect(last.end).toBe(now.getTime() - 3_600_000);
    for (const day of days) {
      expect(localMinutes(day.start, TZ)).toBe(240);
      expect(day.end).toBeGreaterThan(day.start);
    }
    for (let i = 1; i < days.length; i += 1) {
      expect(days[i].start).toBe(days[i - 1].end);
      expect(days[i].date).toBe(addDays(days[i - 1].date, 1));
    }
  });

  it('should end with the previous local day when now is before 05:00 local', () => {
    const now = new Date('2026-10-19T00:30:00Z'); // 03:30 Moscow: the 2026-10-19 day has not started.
    const days = replayDays(now, TZ);
    expect(days[days.length - 1].date).toBe('2026-10-18');
    expect(days[days.length - 1].end).toBe(now.getTime() - 3_600_000);
  });
});
