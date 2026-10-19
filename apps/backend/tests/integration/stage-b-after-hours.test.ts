import { describe, expect, it } from 'vitest';
import { insertOne, updateByPk } from './support/operations.js';
import { evaluate, knownPerson, types } from './support/stageB.js';
import { createTrackingWorld, detect } from './support/tracking.js';

/**
 * after_hours and rostered staff (slice 7, task 5): presence outside the facility operating hours is not reported for
 * a person whose work schedule covers the detection time, give or take 30 minutes (arriving for or leaving a shift).
 * Clock: at(0) is Monday 2026-01-05 08:00 UTC; the facility is open Mon-Fri 09:00-18:00 UTC.
 */
const HOUR = 3600;

async function world() {
  const w = await createTrackingWorld();
  await updateByPk(w.a, 'facilities', w.facility.id, { operating_hours: [{ days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }] });
  const early = await insertOne(w.a, 'work_schedules', {
    name: 'Early', timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5], from: '07:45', to: '16:00' }],
  });
  const night = await insertOne(w.a, 'work_schedules', {
    name: 'Night', timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '06:00' }],
  });
  return { w, early: early.id, night: night.id };
}

async function eventTypes(w: Awaited<ReturnType<typeof createTrackingWorld>>, identity: string, seconds: number): Promise<string[]> {
  return types(await evaluate((await detect(w.orgA.id, w.lobbyCam, identity, seconds)).id));
}

describe('Stage B: after_hours for rostered staff', () => {
  it('should not report a person whose work schedule covers the time', async () => {
    const { w, early } = await world();
    const staff = await knownPerson(w.a, { work_schedule_id: early });
    expect(await eventTypes(w, staff.identity, 0)).not.toContain('after_hours');
    const visitor = await knownPerson(w.a);
    expect(await eventTypes(w, visitor.identity, 0)).toContain('after_hours');
  });

  it('should allow 30 minutes before and after an overnight shift and report presence beyond that', async () => {
    const { w, night } = await world();
    const staff = await knownPerson(w.a, { work_schedule_id: night });
    // Monday 21:40: 20 minutes before the 22:00 shift start.
    expect(await eventTypes(w, staff.identity, 13 * HOUR + 40 * 60)).not.toContain('after_hours');
    // Tuesday 02:00 inside the shift, 06:20 leaving 20 minutes after its end.
    expect(await eventTypes(w, staff.identity, 18 * HOUR)).not.toContain('after_hours');
    expect(await eventTypes(w, staff.identity, 22 * HOUR + 20 * 60)).not.toContain('after_hours');
    // Tuesday 06:50 and Monday 21:10: beyond the 30 minutes.
    expect(await eventTypes(w, staff.identity, 22 * HOUR + 50 * 60)).toContain('after_hours');
    const other = await knownPerson(w.a, { work_schedule_id: night });
    expect(await eventTypes(w, other.identity, 13 * HOUR + 10 * 60)).toContain('after_hours');
  });

  it('should count a short window that overlaps the 30 minutes around the detection', async () => {
    const { w } = await world();
    // Monday 08:05-08:20 UTC, between the instants 08:00 and 08:30: detected 08:00 (overlapping) and 07:20 (outside).
    const brief = await insertOne(w.a, 'work_schedules', {
      name: 'Brief', timezone: 'UTC', windows: [{ days: [1], from: '08:05', to: '08:20' }],
    });
    const inside = await knownPerson(w.a, { work_schedule_id: brief.id });
    expect(await eventTypes(w, inside.identity, 0)).not.toContain('after_hours');
    const outside = await knownPerson(w.a, { work_schedule_id: brief.id });
    expect(await eventTypes(w, outside.identity, -40 * 60)).toContain('after_hours');
  });

  it('should read the work schedule in its own timezone, not the facility one', async () => {
    const { w } = await world();
    // Monday 08:00 UTC is 17:00 in Tokyo.
    const tokyo = await insertOne(w.a, 'work_schedules', {
      name: 'Tokyo evening', timezone: 'Asia/Tokyo', windows: [{ days: [1], from: '17:00', to: '18:00' }],
    });
    const utc = await insertOne(w.a, 'work_schedules', {
      name: 'UTC evening', timezone: 'UTC', windows: [{ days: [1], from: '17:00', to: '18:00' }],
    });
    const remote = await knownPerson(w.a, { work_schedule_id: tokyo.id });
    expect(await eventTypes(w, remote.identity, 0)).not.toContain('after_hours');
    const local = await knownPerson(w.a, { work_schedule_id: utc.id });
    expect(await eventTypes(w, local.identity, 0)).toContain('after_hours');
  });

  it('should still report a rostered person whose profile is not active', async () => {
    const { w, early } = await world();
    const gone = await knownPerson(w.a, { work_schedule_id: early, status: 'terminated' });
    expect(await eventTypes(w, gone.identity, 0)).toContain('after_hours');
  });
});
