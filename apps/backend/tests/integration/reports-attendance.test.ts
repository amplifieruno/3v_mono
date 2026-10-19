import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { insertOne } from './support/operations.js';
import { createReport, metric, metrics, settled } from './support/reports.js';
import { knownPerson } from './support/stageB.js';
import { createTrackingWorld, detect } from './support/tracking.js';

/**
 * Attendance for overnight and around-the-clock schedules (slice 7, task 5): a scheduled day is matched against the
 * first session from 2 hours before the shift start up to 22 hours after it (so an overnight shift owns its own
 * arrival, not the departure from the previous night), and a schedule covering the whole day has no start to be late
 * for. Clock: at(0) is Monday 2026-01-05 08:00 UTC.
 */
const HOUR = 3600;
const DAY = '2026-01-05';

beforeAll(requireBackend);

describe('attendance report', () => {
  it('should judge night-shift arrivals by the shift start and never call around-the-clock staff late', async () => {
    const w = await createTrackingWorld();
    const night = await insertOne(w.a, 'work_schedules', {
      name: 'Night', timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '06:00' }],
    });
    const around = await insertOne(w.a, 'work_schedules', {
      name: 'Around', timezone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5, 6, 7], from: '00:00', to: '24:00' }],
    });
    const leaving = -(HOUR + 55 * 60); // Monday 06:05, the end of Sunday's night shift
    const onTime = await knownPerson(w.a, { work_schedule_id: night.id });
    await detect(w.orgA.id, w.lobbyCam, onTime.identity, leaving);
    await detect(w.orgA.id, w.lobbyCam, onTime.identity, 13 * HOUR + 55 * 60); // 21:55
    const late = await knownPerson(w.a, { work_schedule_id: night.id });
    await detect(w.orgA.id, w.lobbyCam, late.identity, leaving);
    await detect(w.orgA.id, w.lobbyCam, late.identity, 14 * HOUR + 40 * 60); // 22:40
    const absent = await knownPerson(w.a, { work_schedule_id: night.id });
    await detect(w.orgA.id, w.lobbyCam, absent.identity, leaving);
    const guard = await knownPerson(w.a, { work_schedule_id: around.id });
    await detect(w.orgA.id, w.lobbyCam, guard.identity, -25 * 60); // 07:35

    const created = await createReport(w.a, {
      report_type: 'attendance', format: 'json', start_date: DAY, end_date: DAY, parameters: { timezone: 'UTC' },
    });
    const r = await settled(created.id);
    expect(r, r.error ?? '').toMatchObject({ status: 'completed' });
    const m = await metrics(r.id);
    expect([metric(m, 'present'), metric(m, 'late'), metric(m, 'absent'), metric(m, 'scheduled_days')]).toEqual([2, 1, 1, 4]);
  });
});
