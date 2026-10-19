import { describe, expect, it } from 'vitest';
import { CronError, nextRun, parseCron } from './cron.js';

const iso = (d: Date | null) => d?.toISOString() ?? null;

describe('parseCron', () => {
  it('should parse numbers, stars, lists, ranges and steps', () => {
    const c = parseCron('*/15 8-10 1,15 * 1-5');
    expect([...c.minutes]).toEqual([0, 15, 30, 45]);
    expect([...c.hours]).toEqual([8, 9, 10]);
    expect([...c.days]).toEqual([1, 15]);
    expect(c.months.size).toBe(12);
    expect([...c.weekdays]).toEqual([1, 2, 3, 4, 5]);
    expect(c.anyDay).toBe(false);
    expect(c.anyWeekday).toBe(false);
  });

  it('should treat weekday 7 as Sunday and n/step as n..max', () => {
    expect([...parseCron('0 0 * * 7').weekdays]).toEqual([0]);
    expect([...parseCron('5/20 0 * * *').minutes]).toEqual([5, 25, 45]);
    expect([...parseCron('0 0 * * 1-7/3').weekdays].sort()).toEqual([0, 1, 4]);
  });

  it('should reject malformed expressions and out-of-range values', () => {
    for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8',
      '5-1 * * * *', '*/0 * * * *', 'a * * * *', '1,,2 * * * *', 'MON * * * *', '* * * JAN *']) {
      expect(() => parseCron(bad), bad).toThrow(CronError);
    }
  });
});

describe('nextRun', () => {
  it('should find the next minute strictly after the given instant in UTC', () => {
    expect(iso(nextRun('*/15 * * * *', 'UTC', new Date('2026-10-19T10:00:00Z')))).toBe('2026-10-19T10:15:00.000Z');
    expect(iso(nextRun('*/15 * * * *', 'UTC', new Date('2026-10-19T10:07:30Z')))).toBe('2026-10-19T10:15:00.000Z');
    expect(iso(nextRun('0 7 * * *', 'UTC', new Date('2026-10-19T07:00:00Z')))).toBe('2026-10-20T07:00:00.000Z');
  });

  it('should evaluate wall-clock times in the schedule timezone', () => {
    // 07:00 in Moscow (UTC+3, no DST).
    expect(iso(nextRun('0 7 * * *', 'Europe/Moscow', new Date('2026-10-19T05:00:00Z')))).toBe('2026-10-20T04:00:00.000Z');
    // Monday 08:00 in New York, from Saturday.
    expect(iso(nextRun('0 8 * * 1', 'America/New_York', new Date('2026-10-17T12:00:00Z')))).toBe('2026-10-19T12:00:00.000Z');
  });

  it('should follow daylight saving changes', () => {
    // Berlin switches to CEST on 2026-03-29: 06:00 local is 05:00Z before and 04:00Z after.
    expect(iso(nextRun('0 6 * * *', 'Europe/Berlin', new Date('2026-03-28T06:00:00Z')))).toBe('2026-03-29T04:00:00.000Z');
    expect(iso(nextRun('0 6 * * *', 'Europe/Berlin', new Date('2026-03-27T12:00:00Z')))).toBe('2026-03-28T05:00:00.000Z');
  });

  it('should match day of month OR weekday when both are restricted', () => {
    // 2026-10-20 is a Tuesday; the 25th is a Sunday.
    expect(iso(nextRun('0 0 25 * 2', 'UTC', new Date('2026-10-19T00:00:00Z')))).toBe('2026-10-20T00:00:00.000Z');
    expect(iso(nextRun('0 0 25 * 2', 'UTC', new Date('2026-10-23T00:00:00Z')))).toBe('2026-10-25T00:00:00.000Z');
  });

  it('should handle months and leap days and return null when a date never occurs', () => {
    expect(iso(nextRun('0 0 1 1 *', 'UTC', new Date('2026-10-19T00:00:00Z')))).toBe('2027-01-01T00:00:00.000Z');
    expect(iso(nextRun('0 0 29 2 *', 'UTC', new Date('2026-10-19T00:00:00Z')))).toBe('2028-02-29T00:00:00.000Z');
    expect(nextRun('0 0 30 2 *', 'UTC', new Date('2026-10-19T00:00:00Z'))).toBeNull();
  });

  it('should reject an unknown timezone', () => {
    expect(() => nextRun('* * * * *', 'Mars/Olympus', new Date())).toThrow(CronError);
  });
});
