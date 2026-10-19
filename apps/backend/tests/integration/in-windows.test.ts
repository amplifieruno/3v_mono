import { describe, expect, it } from 'vitest';
import { runSqlRows } from './support/sql.js';

const MON_9_18 = `'[{"days":[1],"from":"09:00","to":"18:00"}]'`;

/** Evaluates itap.in_windows(windows, tz, ts) and returns the boolean (null stays null). */
async function inWindows(windows: string | null, tz: string | null, ts: string | null): Promise<boolean | null> {
  const w = windows === null ? 'null' : windows.startsWith("'") ? `${windows}::jsonb` : `'${windows}'::jsonb`;
  const z = tz === null ? 'null' : `'${tz}'`;
  const t = ts === null ? 'null' : `'${ts}'::timestamptz`;
  const rows = await runSqlRows(`select itap.in_windows(${w}, ${z}, ${t}) as r;`);
  const value = rows[0]?.r;
  return value === null || value === undefined ? null : value === 't' || value === 'true';
}

describe('itap.in_windows', () => {
  it('should match Monday 09:30 Moscow time inside a Monday 09:00-18:00 window', async () => {
    // 2026-10-19 is a Monday; 06:30Z = 09:30 Moscow (UTC+3).
    expect(await inWindows(MON_9_18, 'Europe/Moscow', '2026-10-19T06:30:00Z')).toBe(true);
  });

  it('should not match Sunday', async () => {
    expect(await inWindows(MON_9_18, 'Europe/Moscow', '2026-10-18T06:30:00Z')).toBe(false);
  });

  it('should evaluate the weekday and time in the given timezone, not UTC', async () => {
    // 2026-10-18T22:00Z is Sunday in UTC but Monday 01:00 in Moscow -> before 09:00, so false;
    // 2026-10-19T00:00Z is Monday in UTC but Monday 03:00 Moscow -> false; Sunday 20:00Z-> Monday 23:00 Moscow -> false.
    expect(await inWindows(MON_9_18, 'Europe/Moscow', '2026-10-18T22:00:00Z')).toBe(false);
    // Monday 09:30 in Los Angeles (PDT, UTC-7) = 16:30Z Monday; same instant is Monday 19:30 Moscow -> false there.
    expect(await inWindows(MON_9_18, 'America/Los_Angeles', '2026-10-19T16:30:00Z')).toBe(true);
    expect(await inWindows(MON_9_18, 'Europe/Moscow', '2026-10-19T16:30:00Z')).toBe(false);
    // Sunday 23:30 UTC is Monday 02:30 in Moscow (day rolls over), still outside the hours.
    expect(await inWindows('[{"days":[1],"from":"00:00","to":"24:00"}]', 'Europe/Moscow', '2026-10-18T22:30:00Z')).toBe(true);
    expect(await inWindows('[{"days":[1],"from":"00:00","to":"24:00"}]', 'UTC', '2026-10-18T22:30:00Z')).toBe(false);
  });

  it('should treat from as inclusive and to as exclusive', async () => {
    expect(await inWindows(MON_9_18, 'UTC', '2026-10-19T09:00:00Z')).toBe(true);
    expect(await inWindows(MON_9_18, 'UTC', '2026-10-19T17:59:59Z')).toBe(true);
    expect(await inWindows(MON_9_18, 'UTC', '2026-10-19T18:00:00Z')).toBe(false);
    expect(await inWindows(MON_9_18, 'UTC', '2026-10-19T08:59:59Z')).toBe(false);
  });

  it('should cover the next day early morning for an overnight window and attribute it to the start day', async () => {
    const night = '[{"days":[1],"from":"22:00","to":"06:00"}]';
    expect(await inWindows(night, 'UTC', '2026-10-19T23:00:00Z')).toBe(true); // Monday 23:00
    expect(await inWindows(night, 'UTC', '2026-10-20T02:00:00Z')).toBe(true); // Tuesday 02:00, started Monday
    expect(await inWindows(night, 'UTC', '2026-10-20T06:00:00Z')).toBe(false); // end exclusive
    expect(await inWindows(night, 'UTC', '2026-10-19T02:00:00Z')).toBe(false); // Monday 02:00 belongs to Sunday's night
    expect(await inWindows(night, 'UTC', '2026-10-20T23:00:00Z')).toBe(false); // Tuesday 23:00 not listed
  });

  it('should wrap overnight windows from Sunday (7) into Monday (1)', async () => {
    const sunNight = '[{"days":[7],"from":"22:00","to":"06:00"}]';
    expect(await inWindows(sunNight, 'UTC', '2026-10-19T02:00:00Z')).toBe(true); // Monday 02:00
    expect(await inWindows(sunNight, 'UTC', '2026-10-18T23:00:00Z')).toBe(true); // Sunday 23:00
  });

  it('should match when any window in the array matches', async () => {
    const two = '[{"days":[2],"from":"09:00","to":"10:00"},{"days":[1,3],"from":"12:00","to":"13:00"}]';
    expect(await inWindows(two, 'UTC', '2026-10-21T12:30:00Z')).toBe(true); // Wednesday
    expect(await inWindows(two, 'UTC', '2026-10-20T12:30:00Z')).toBe(false); // Tuesday 12:30
  });

  it('should return false for an empty array, and false for null or non-array windows', async () => {
    expect(await inWindows('[]', 'UTC', '2026-10-19T09:30:00Z')).toBe(false);
    expect(await inWindows(null, 'UTC', '2026-10-19T09:30:00Z')).toBe(false);
    expect(await inWindows('{"days":[1]}', 'UTC', '2026-10-19T09:30:00Z')).toBe(false);
    expect(await inWindows('"x"', 'UTC', '2026-10-19T09:30:00Z')).toBe(false);
  });

  it('should return false for a null timestamp and treat a null timezone as UTC', async () => {
    expect(await inWindows(MON_9_18, 'UTC', null)).toBe(false);
    expect(await inWindows(MON_9_18, null, '2026-10-19T09:30:00Z')).toBe(true);
  });

  it('should skip malformed windows instead of failing, still matching valid ones', async () => {
    const mixed = `[
      {"days":[1],"from":"9am","to":"18:00"},
      {"days":"1","from":"09:00","to":"18:00"},
      {"from":"09:00","to":"18:00"},
      {"days":[1,"1",8,0],"from":"25:00","to":"26:00"},
      42,
      null,
      {"days":[1],"from":"09:00","to":"09:00"},
      {"days":[1],"from":"09:00","to":"18:00"}
    ]`;
    expect(await inWindows(mixed, 'UTC', '2026-10-19T09:30:00Z')).toBe(true);
    const onlyBad = '[{"days":[1],"from":"9am","to":"18:00"},{"days":["1"],"from":"09:00","to":"18:00"},{"days":[1],"from":"09:00","to":"09:00"}]';
    expect(await inWindows(onlyBad, 'UTC', '2026-10-19T09:30:00Z')).toBe(false);
  });

  it('should raise on an unknown timezone', async () => {
    await expect(inWindows(MON_9_18, 'Mars/Olympus', '2026-10-19T09:30:00Z')).rejects.toThrow(/time zone/i);
  });
});
