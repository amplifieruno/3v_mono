import { describe, expect, it } from 'vitest';
import { clip, formatDuration, formatFigure, heatLevel, runsOf, scaleMax } from '../../src/blocks/charts/chart-scale';
import { dayWindow, hourWindow, seriesBucket } from '../../src/blocks/charts/period';
import {
  addDays,
  dayIn,
  knownZone,
  localHour,
  nextHour,
  weekdayOf,
  zonedMidnight,
  zonedTime,
} from '../../src/blocks/charts/zoned-time';

/**
 * The shared chart helpers (`src/blocks/charts`): calendar arithmetic in a facility's zone (Review
 * Focus 5: day boundaries are the facility's midnights, not the browser's or UTC's), the period
 * windows the stats queries are read for, and the scales and shades of the charts.
 */

describe('zoned time', () => {
  it('should find a zone’s midnight without a fixed offset', () => {
    expect(zonedMidnight('2026-10-22', 'Europe/Moscow').toISOString()).toBe('2026-10-21T21:00:00.000Z');
    expect(zonedMidnight('2026-10-22', 'UTC').toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(zonedMidnight('2026-10-22', 'Pacific/Kiritimati').toISOString()).toBe('2026-10-21T10:00:00.000Z');
    expect(zonedMidnight('2026-10-22', 'Asia/Kolkata').toISOString()).toBe('2026-10-21T18:30:00.000Z');
  });

  it('should follow daylight saving time on and around the days the clocks change', () => {
    // New York: EDT (UTC-4) until 1 November 2026, EST (UTC-5) from then.
    expect(zonedMidnight('2026-10-31', 'America/New_York').toISOString()).toBe('2026-10-31T04:00:00.000Z');
    expect(zonedMidnight('2026-11-01', 'America/New_York').toISOString()).toBe('2026-11-01T04:00:00.000Z');
    expect(zonedMidnight('2026-11-02', 'America/New_York').toISOString()).toBe('2026-11-02T05:00:00.000Z');
    // 03:00 on the day the clocks move back is already standard time.
    expect(zonedTime('2026-11-01', 3, 'America/New_York').toISOString()).toBe('2026-11-01T08:00:00.000Z');
    // Berlin moves forward on 29 March 2026: midnight is still CET (UTC+1).
    expect(zonedMidnight('2026-03-29', 'Europe/Berlin').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(zonedMidnight('2026-03-30', 'Europe/Berlin').toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });

  it('should read a midnight the clocks skip or repeat as Postgres does', () => {
    // Values from `'<day>'::timestamp AT TIME ZONE '<zone>'` on the dev database.
    expect(zonedMidnight('2026-09-06', 'America/Santiago').toISOString()).toBe('2026-09-06T04:00:00.000Z');
    expect(zonedMidnight('2026-03-08', 'America/Havana').toISOString()).toBe('2026-03-08T05:00:00.000Z');
    expect(zonedTime('2026-03-29', 2, 'Europe/Berlin').toISOString()).toBe('2026-03-29T01:00:00.000Z');
    expect(zonedTime('2026-11-01', 1, 'America/New_York').toISOString()).toBe('2026-11-01T06:00:00.000Z');
  });

  it('should read the hour and the day of an instant on the zone’s clock', () => {
    const at = new Date('2026-10-22T22:30:00Z');
    expect(dayIn(at, 'UTC')).toBe('2026-10-22');
    expect(dayIn(at, 'Europe/Moscow')).toBe('2026-10-23');
    expect(localHour(at, 'Europe/Moscow')).toBe(1);
    expect(localHour('2026-10-22T13:00:00+00:00', 'Asia/Kolkata')).toBe(18);
    expect(localHour(at, 'UTC')).toBe(22);
  });

  it('should read an unknown or missing zone as UTC', () => {
    expect(knownZone('Mars/Olympus')).toBe('UTC');
    expect(knownZone(null)).toBe('UTC');
    expect(zonedMidnight('2026-10-22', 'Mars/Olympus').toISOString()).toBe('2026-10-22T00:00:00.000Z');
    expect(dayIn(new Date('2026-10-22T22:30:00Z'), null)).toBe('2026-10-22');
  });

  it('should count calendar days and weekdays without a zone', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-10-19')).toBe(0); // a Monday
    expect(weekdayOf('2026-10-25')).toBe(6); // a Sunday
    expect(nextHour(new Date('2026-10-22T13:20:00Z')).toISOString()).toBe('2026-10-22T14:00:00.000Z');
    expect(nextHour(new Date('2026-10-22T13:00:00Z')).toISOString()).toBe('2026-10-22T13:00:00.000Z');
  });
});

describe('period windows', () => {
  it('should cut a period of days at the facility’s midnights, today included (Review Focus 5)', () => {
    // 22:30 UTC on 22 October is already 01:30 on 23 October in Moscow (UTC+3).
    const window = dayWindow(new Date('2026-10-22T22:30:00Z'), 'Europe/Moscow', 7);
    expect(window.days).toEqual([
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
    ]);
    expect(window.from).toBe('2026-10-16T21:00:00.000Z');
    expect(window.to).toBe('2026-10-23T21:00:00.000Z');
    // The same instant in UTC still has 22 October as today.
    const utc = dayWindow(new Date('2026-10-22T22:30:00Z'), 'UTC', 7);
    expect(utc.days.at(-1)).toBe('2026-10-22');
    expect(utc.from).toBe('2026-10-16T00:00:00.000Z');
    expect(utc.to).toBe('2026-10-23T00:00:00.000Z');
  });

  it('should span a change of the clocks with whole local days', () => {
    const window = dayWindow(new Date('2026-11-02T15:00:00Z'), 'America/New_York', 3);
    expect(window.days).toEqual(['2026-10-31', '2026-11-01', '2026-11-02']);
    expect(window.from).toBe('2026-10-31T04:00:00.000Z');
    expect(window.to).toBe('2026-11-03T05:00:00.000Z');
  });

  it('should read the last hours up to the next hour boundary', () => {
    expect(hourWindow(new Date('2026-10-22T13:20:00Z'), 1)).toEqual({
      from: '2026-10-21T14:00:00.000Z',
      to: '2026-10-22T14:00:00.000Z',
    });
  });

  it('should read hours up to a week and days beyond, within the server’s 2000-hour limit', () => {
    expect(seriesBucket(1)).toBe('hour');
    expect(seriesBucket(7)).toBe('hour');
    expect(seriesBucket(8)).toBe('day');
    expect(seriesBucket(30, 'hour')).toBe('hour');
    expect(seriesBucket(90, 'hour')).toBe('day');
    expect(seriesBucket(2, 'day')).toBe('day');
  });
});

describe('chart scales', () => {
  it('should scale to a tenth above the largest value and never to zero', () => {
    expect(scaleMax([1, null, 10])).toBeCloseTo(11);
    expect(scaleMax([])).toBe(1);
    expect(scaleMax([0, null])).toBe(1);
  });

  it('should break a line where a point has no figure', () => {
    expect(runsOf([1, 2, null, 4, null, null, 7, 8])).toEqual([
      { start: 0, values: [1, 2] },
      { start: 3, values: [4] },
      { start: 6, values: [7, 8] },
    ]);
  });

  it('should shade a cell against the grid’s largest figure', () => {
    expect(heatLevel(null, 10)).toBe(0);
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(0.1, 10)).toBe(1);
    expect(heatLevel(5, 10)).toBe(3);
    expect(heatLevel(10, 10)).toBe(5);
    expect(heatLevel(3, 0)).toBe(0);
  });

  it('should write labels and figures for reading', () => {
    expect(clip('Reception and lobby', 10)).toBe('Reception…');
    expect(clip('Lobby', 10)).toBe('Lobby');
    expect(formatFigure(3)).toBe('3');
    expect(formatFigure(2.345)).toBe('2.3');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(600)).toBe('10 min');
    expect(formatDuration(7500)).toBe('2 h 5 min');
  });
});
