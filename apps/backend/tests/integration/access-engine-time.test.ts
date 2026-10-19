import { describe, expect, it } from 'vitest';
import { accessWorld, evaluate, publishPolicy } from './support/accessEngine.js';
import { createAccessPoint, createArea, createFacility } from './support/facilities.js';
import { runSql } from './support/sql.js';

/**
 * Decision engine (slice 8 task 2), Review Focus 3: schedules are wall-clock windows evaluated in the TARGET
 * facility's timezone (never the organization's). DST rule: a window overlapping the skipped spring-forward hour is
 * simply shorter (no instant exists in the gap); during the repeated fall-back hour both instances match.
 */

async function newYorkDoor() {
  const w = await accessWorld();
  // Organization in Tokyo, facility in New York: the facility timezone must win.
  await runSql(`update itap.organizations set timezone = 'Asia/Tokyo' where id = '${w.orgA.id}'`);
  const facility = await createFacility(w.a, { timezone: 'America/New_York' });
  const area = await createArea(w.a, facility.id, 'NY lobby');
  const door = await createAccessPoint(w.a, facility.id, area.id);
  const at = (iso: string) => evaluate(w.orgA.id, door.id, { profile: w.profile, at: iso });
  return { w, facility, door, at };
}

describe('evaluate_access: schedules, timezones and DST', () => {
  it('should evaluate office hours in the facility timezone, not the organization timezone', async () => {
    const { w, facility, at } = await newYorkDoor();
    const schedule = [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '17:00' }];
    await publishPolicy(w, { profile_type: 'employee' }, { facility_id: facility.id }, { schedule });
    const morning = await at('2026-10-19T14:00:00Z'); // Mon 10:00 New York (Mon 23:00 Tokyo)
    expect(morning.reason).toBe('policy_allow');
    expect(morning.signals.timezone).toBe('America/New_York');
    expect((await at('2026-10-19T23:30:00Z')).reason).toBe('outside_schedule'); // Mon 19:30 NY (Tue 08:30 Tokyo)
    expect((await at('2026-10-17T15:00:00Z')).reason).toBe('outside_schedule'); // Saturday 11:00 NY
  });

  it('should shorten a window that overlaps the spring-forward gap (2026-03-08, 02:00 -> 03:00 EST/EDT)', async () => {
    const { w, facility, at } = await newYorkDoor();
    await publishPolicy(w, { profile_type: 'employee' }, { facility_id: facility.id }, {
      schedule: [{ days: [7], from: '02:00', to: '04:00' }],
    });
    expect((await at('2026-03-08T06:59:00Z')).reason).toBe('outside_schedule'); // 01:59 EST
    expect((await at('2026-03-08T07:00:00Z')).reason).toBe('policy_allow'); // 03:00 EDT (02:00 never happens)
    expect((await at('2026-03-08T07:59:00Z')).reason).toBe('policy_allow'); // 03:59 EDT
    expect((await at('2026-03-08T08:00:00Z')).reason).toBe('outside_schedule'); // 04:00 EDT — one real hour in total
  });

  it('should never match a window lying entirely inside the skipped hour', async () => {
    const { w, facility, at } = await newYorkDoor();
    await publishPolicy(w, { profile_type: 'employee' }, { facility_id: facility.id }, {
      schedule: [{ days: [7], from: '02:00', to: '03:00' }],
    });
    for (const iso of ['2026-03-08T06:30:00Z', '2026-03-08T06:59:59Z', '2026-03-08T07:00:00Z', '2026-03-08T07:30:00Z']) {
      expect((await at(iso)).reason).toBe('outside_schedule');
    }
  });

  it('should match both instances of the repeated fall-back hour (2026-11-01, 01:00-02:00 twice)', async () => {
    const { w, facility, at } = await newYorkDoor();
    await publishPolicy(w, { profile_type: 'employee' }, { facility_id: facility.id }, {
      schedule: [{ days: [7], from: '01:00', to: '02:00' }],
    });
    expect((await at('2026-11-01T04:59:00Z')).reason).toBe('outside_schedule'); // 00:59 EDT
    expect((await at('2026-11-01T05:30:00Z')).reason).toBe('policy_allow'); // 01:30 EDT (first instance)
    expect((await at('2026-11-01T06:30:00Z')).reason).toBe('policy_allow'); // 01:30 EST (second instance)
    expect((await at('2026-11-01T07:00:00Z')).reason).toBe('outside_schedule'); // 02:00 EST — two real hours in total
  });
});
