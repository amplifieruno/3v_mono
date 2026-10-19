import { describe, expect, it } from 'vitest';
import { buildHistoryPlan, type HistoryInput, type HistoryPerson } from './historyPlan.js';
import { localDate, localMinutes, weekday } from './historyTime.js';

const TZ = 'Europe/Moscow';
const NOW = new Date('2026-10-19T09:17:00Z');
const END = NOW.getTime() - 3_600_000;
const NIGHT = new Set(['id-110', 'id-111']);

function person(n: number, extra: Partial<HistoryPerson> = {}): HistoryPerson {
  return {
    identityId: `id-${n}`,
    profileId: `p-${n}`,
    role: 'employee',
    clearance: n % 5 === 0 ? 'basic' : 'standard',
    car: n % 3 === 0,
    dockDuty: n % 7 === 0 && n % 5 !== 0,
    guard: null,
    night: false,
    activeFrom: null,
    activeTo: null,
    ...extra,
  };
}

function input(): HistoryInput {
  const people: HistoryPerson[] = Array.from({ length: 60 }, (_, i) => person(i + 1));
  people.push(person(100, { guard: 'chief', clearance: 'elevated' }), person(101, { guard: 'guard' }));
  people.push(person(102, { role: 'contractor', clearance: 'basic', activeFrom: '2026-09-01', activeTo: '2027-01-01' }));
  people.push(person(103, { role: 'vip', clearance: 'elevated', car: true }), person(104, { role: 'vip', clearance: 'elevated' }));
  people.push(person(105, { role: 'contractor', clearance: 'basic', activeFrom: '2026-01-10', activeTo: '2026-09-09' }));
  people.push(person(110, { night: true }), person(111, { night: true, guard: 'guard' }));
  const visitDates = ['2026-10-01', '2026-10-05', '2026-10-08', '2026-10-11', '2026-10-14', '2026-10-16', '2026-10-19'];
  return {
    now: NOW,
    timezone: TZ,
    people,
    visitors: visitDates.map((visitDate, i) => ({ profileId: `v-${i}`, identityId: i % 2 === 0 ? `vid-${i}` : null, visitDate })),
    hosts: [{ profileId: 'p-1', companyId: 'c-1' }, { profileId: 'p-2', companyId: 'c-2' }],
    blacklistedIdentity: 'bl',
    unknownIdentities: ['u-1', 'u-2', 'u-3'],
    watchedIdentity: 'u-1',
    terminatedIdentity: 'id-105',
  };
}

describe('buildHistoryPlan', () => {
  const plan = buildHistoryPlan(input());
  const local = (at: number) => ({ date: localDate(at, TZ), minutes: localMinutes(at, TZ) });

  it('should be deterministic for the same input', () => {
    expect(buildHistoryPlan(input())).toEqual(plan);
  });

  it('should keep detections inside the replay days, sorted by time then identity', () => {
    const { detections, days } = plan;
    expect(detections.length).toBeGreaterThan(5_000);
    expect(detections[0].at).toBeGreaterThanOrEqual(days[0].start);
    // The idempotency marker of the replay: history older than 29 days.
    expect(detections[0].at).toBeLessThan(NOW.getTime() - 29 * 86_400_000);
    for (let i = 1; i < detections.length; i += 1) {
      const [a, b] = [detections[i - 1], detections[i]];
      expect(a.at < b.at || (a.at === b.at && a.identityId <= b.identityId)).toBe(true);
    }
    expect(detections[detections.length - 1].at).toBeLessThan(END);
    for (const day of days) {
      expect(detections.filter((d) => d.at >= day.start && d.at < day.end).length).toBeLessThan(3_000);
    }
  });

  it('should bring the blacklisted person to the loading dock twice, once after hours', () => {
    const seen = plan.detections.filter((d) => d.identityId === 'bl');
    expect(seen.every((d) => d.point === 'dock')).toBe(true);
    const dates = [...new Set(seen.map((d) => local(d.at).date))];
    expect(dates).toHaveLength(2);
    expect(seen.some((d) => local(d.at).minutes >= 22 * 60)).toBe(true);
    // The daytime visit stays long enough to loiter (Loading Dock threshold 10 minutes).
    const day = seen.filter((d) => local(d.at).minutes < 22 * 60);
    expect(day[day.length - 1].at - day[0].at).toBeGreaterThan(10 * 60_000);
  });

  it('should take exactly one person without clearance into the server room, once', () => {
    const server = plan.detections.filter((d) => d.point === 'serverRoom' && d.identityId.startsWith('id-') && d.identityId !== 'id-100');
    expect(new Set(server.map((d) => d.identityId)).size).toBe(1);
    expect(new Set(server.map((d) => local(d.at).date)).size).toBe(1);
  });

  it('should have a couple of after-hours entries by employees and none from regular office days', () => {
    const outside = plan.detections.filter((d) => {
      const { date, minutes } = local(d.at);
      const day = weekday(date);
      const open = day <= 5 ? minutes >= 7 * 60 && minutes < 21 * 60 : day === 6 && minutes >= 9 * 60 && minutes < 15 * 60;
      return !open && d.identityId.startsWith('id-') && !NIGHT.has(d.identityId);
    });
    const entries = new Set(outside.map((d) => `${d.identityId}/${local(d.at).date}`));
    expect(entries.size).toBeGreaterThanOrEqual(2);
    expect(entries.size).toBeLessThanOrEqual(3);
  });

  it('should bring VIPs on several mornings and unknown faces a few times', () => {
    const vipDays = new Set(plan.detections.filter((d) => d.identityId === 'id-103').map((d) => local(d.at).date));
    expect(vipDays.size).toBeGreaterThanOrEqual(5);
    const unknown = plan.detections.filter((d) => d.identityId.startsWith('u-'));
    expect(new Set(unknown.map((d) => `${d.identityId}/${local(d.at).date}`)).size).toBeGreaterThanOrEqual(6);
  });

  it('should plan visits in every status a seed can write, with tracked ones matching their detections', () => {
    const statuses = new Set(plan.visits.map((v) => v.status));
    expect([...statuses].sort()).toEqual(['cancelled', 'checked_in', 'checked_out', 'scheduled']);
    // A scheduled visit that already ended becomes no_show through the lifecycle job; others are in the future.
    const scheduled = plan.visits.filter((v) => v.status === 'scheduled');
    expect(scheduled.some((v) => v.expectedEnd < END)).toBe(true);
    expect(scheduled.some((v) => v.expectedStart > NOW.getTime())).toBe(true);
    for (const visit of plan.visits.filter((v) => v.status === 'checked_out' || v.status === 'checked_in')) {
      expect(visit.checkedInAt).toBeDefined();
      if (visit.status === 'checked_out') expect(visit.checkedOutAt).toBeGreaterThan(visit.checkedInAt ?? 0);
      expect(visit.checkedInAt ?? 0).toBeLessThan(END);
    }
    const tracked = plan.visits.find((v) => v.status === 'checked_out' && v.identityId);
    const own = plan.detections.filter((d) => d.identityId === tracked?.identityId);
    expect(own.length).toBeGreaterThan(0);
    expect(own[0].at).toBeGreaterThanOrEqual(tracked?.checkedInAt ?? 0);
  });

  it('should plan expected visit times on whole quarter hours', () => {
    for (const v of plan.visits) {
      expect(v.expectedStart % (15 * 60_000)).toBe(0);
      expect(v.expectedEnd % (15 * 60_000)).toBe(0);
    }
  });

  it('should bring an unknown face into the server room and a contractor to the executive floor once', () => {
    expect(new Set(plan.detections.filter((d) => d.point === 'serverRoom' && d.identityId.startsWith('u-')).map((d) => local(d.at).date)).size).toBe(1);
    expect(plan.detections.filter((d) => d.point === 'executive' && d.identityId === 'id-102')).toHaveLength(1);
  });

  it('should overfill Meeting Room 12A (capacity 12) once with 13 cleared employees', () => {
    const meeting = plan.detections.filter((d) => d.point === 'meeting');
    const people = new Set(meeting.map((d) => d.identityId));
    expect(people.size).toBe(13);
    expect(new Set(meeting.map((d) => local(d.at).date)).size).toBe(1);
    // All seated within one 15-minute occupancy bucket and one 5-minute replay window.
    const times = meeting.map((d) => d.at);
    expect(Math.max(...times) - Math.min(...times)).toBeLessThan(2 * 60_000);
    const byId = new Map(input().people.map((p) => [p.identityId, p]));
    expect([...people].every((id) => byId.get(id)?.clearance !== 'basic' && byId.get(id)?.role === 'employee')).toBe(true);
  });

  it('should keep one unknown face in the lobby lounge for over 40 minutes (unusual dwell)', () => {
    const stays = new Map<string, number[]>();
    for (const d of plan.detections.filter((x) => x.point === 'lounge' && x.identityId.startsWith('u-'))) {
      const key = `${d.identityId}/${local(d.at).date}`;
      stays.set(key, [...(stays.get(key) ?? []), d.at]);
    }
    const longest = Math.max(...[...stays.values()].map((t) => Math.max(...t) - Math.min(...t)));
    expect(longest).toBeGreaterThan(40 * 60_000);
    // Seen at least every 3 minutes: the session (5-minute timeout) stays open throughout.
    const [stay] = [...stays.values()].filter((t) => Math.max(...t) - Math.min(...t) > 40 * 60_000);
    for (let i = 1; i < stay.length; i += 1) expect(stay[i] - stay[i - 1]).toBeLessThanOrEqual(3 * 60_000 + 6_000);
  });

  it('should bring the terminated contractor once (entrance, reception) and never on regular days', () => {
    const seen = plan.detections.filter((d) => d.identityId === 'id-105');
    expect([...new Set(seen.map((d) => d.point))]).toEqual(['entrance', 'reception']);
    expect(new Set(seen.map((d) => local(d.at).date)).size).toBe(1);
    expect(seen[seen.length - 1].at - seen[0].at).toBeLessThan(3 * 60_000);
  });

  it('should only produce detections at the planned camera points with plausible face values', () => {
    for (const d of plan.detections) {
      expect(d.similarity).toBeGreaterThan(0.4);
      expect(d.similarity).toBeLessThan(1);
      expect(d.bbox.x + d.bbox.width).toBeLessThanOrEqual(1920);
      expect(d.bbox.y + d.bbox.height).toBeLessThanOrEqual(1080);
    }
  });

  it('should bring office employees on time on most weekdays: about 80% on time, 15% late, 5% absent', () => {
    const office = input().people.filter((p) => p.role === 'employee' && !p.guard && !p.night).map((p) => p.identityId);
    const first = new Map<string, number>();
    for (const d of plan.detections) {
      const { date, minutes } = local(d.at);
      const key = `${d.identityId}/${date}`;
      if (weekday(date) <= 5 && minutes < 12 * 60 && !first.has(key)) first.set(key, minutes);
    }
    let onTime = 0;
    let late = 0;
    let absent = 0;
    for (const { date } of plan.days.filter((day) => weekday(day.date) <= 5 && day.end - day.start > 20 * 3_600_000)) {
      for (const id of office) {
        const minutes = first.get(`${id}/${date}`);
        if (minutes === undefined) absent += 1;
        else if (minutes >= 7 * 60 + 50 && minutes <= 8 * 60 + 10) onTime += 1;
        else if (minutes > 8 * 60 + 15) late += 1;
      }
    }
    const total = onTime + late + absent;
    expect(onTime / total).toBeGreaterThan(0.74);
    expect(onTime / total).toBeLessThan(0.86);
    expect(late / total).toBeGreaterThan(0.1);
    expect(late / total).toBeLessThan(0.2);
    expect(absent / total).toBeGreaterThan(0.02);
    expect(absent / total).toBeLessThan(0.09);
  });

  it('should bring night-shift staff around 22:00 and let them leave around 06:00, never across the day boundary', () => {
    const night = plan.detections.filter((d) => NIGHT.has(d.identityId));
    expect(night.length).toBeGreaterThan(100);
    const arrivals = new Map<string, number>();
    for (const d of night) {
      const { minutes } = local(d.at);
      // Nobody on camera around the 04:00 replay day boundary.
      expect(minutes < 3 * 60 + 45 || minutes > 4 * 60 + 15).toBe(true);
      if (minutes >= 20 * 60) {
        const key = `${d.identityId}/${local(d.at).date}`;
        if (!arrivals.has(key)) arrivals.set(key, minutes);
      }
    }
    const times = [...arrivals.values()];
    expect(times.length).toBeGreaterThan(40);
    const onTime = times.filter((m) => m >= 21 * 60 + 45 && m <= 22 * 60 + 10).length;
    expect(onTime / times.length).toBeGreaterThan(0.7);
    const departures = night.filter((d) => local(d.at).minutes >= 5 * 60 + 45 && local(d.at).minutes <= 6 * 60 + 25);
    expect(departures.length).toBeGreaterThan(40);
    // The night guard checks the loading dock during the shift.
    expect(night.some((d) => d.identityId === 'id-111' && d.point === 'dock' && local(d.at).minutes < 3 * 60)).toBe(true);
  });

  it('should take a few people on unusual routes between busy areas, about three a week', () => {
    const area = (point: string) => (point.startsWith('turnstile') ? 'gallery' : point);
    const rare = new Set(['parking>reception', 'gallery>reception', 'reception>entrance', 'entrance>parking', 'parking>entrance']);
    const last = new Map<string, { at: number; point: string }>();
    const seen: string[] = [];
    for (const d of plan.detections) {
      const prev = last.get(d.identityId);
      if (prev && d.at - prev.at < 5 * 60_000 && area(prev.point) !== area(d.point)) {
        const pair = `${area(prev.point)}>${area(d.point)}`;
        if (rare.has(pair)) seen.push(`${pair}@${local(d.at).date}`);
      }
      last.set(d.identityId, { at: d.at, point: d.point });
    }
    expect(seen.length).toBeGreaterThanOrEqual(8);
    expect(seen.length).toBeLessThanOrEqual(12);
    expect(new Set(seen.map((s) => s.split('@')[1])).size).toBeGreaterThanOrEqual(7);
  });
});
