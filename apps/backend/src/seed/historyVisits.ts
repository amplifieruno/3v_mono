import { addDays, weekday, zonedTime } from './historyTime.js';
import type { Track } from './historyScripts.js';

/** A visitor profile; tracked on camera only when it has an identity (biometric consent given). */
export type HistoryVisitor = { profileId: string; identityId: string | null; visitDate: string };
export type HistoryHost = { profileId: string; companyId: string | null };

/**
 * A visit row. Past visits are history written directly (the check-in desk is a user action with no replay); a
 * `scheduled` visit whose expected_end has passed becomes `no_show` through the lifecycle job during the replay.
 */
export type PlannedVisit = {
  visitorProfileId: string;
  identityId: string | null;
  hostProfileId: string;
  companyId: string | null;
  purpose: string;
  expectedStart: number;
  expectedEnd: number;
  status: 'scheduled' | 'checked_in' | 'checked_out' | 'cancelled';
  checkedInAt?: number;
  checkedOutAt?: number;
  badgeNumber?: string;
  cancellationReason?: string;
};

const PURPOSES = ['Business meeting', 'Job interview', 'Contract signing', 'Product demo', 'Audit', 'Maintenance inspection'];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Window = { today: string; end: number; first: string };

function previousWeekday(date: string): string {
  let d = addDays(date, -1);
  while (weekday(d) > 5) d = addDays(d, -1);
  return d;
}

/** Arrival, reception check-in, (optionally a long wait in the lounge), a meeting upstairs and the way out. */
function visitWalk(t: Track, identityId: string, arrive: number, wait: boolean): number {
  const { rnd } = t;
  const entered = t.pass(identityId, 'entrance', arrive);
  const signed = t.pass(identityId, 'reception', entered + rnd.int(50, 90) * 1000, 2);
  // Waiting for the host: seen in the lounge for 27+ minutes (Lobby Lounge loitering threshold: 20 minutes).
  const waited = wait ? t.linger(identityId, 'lounge', signed + 2 * MINUTE, 27) : signed;
  const inside = t.pass(identityId, t.turnstile(), waited + rnd.int(150, 240) * 1000);
  return t.leave(identityId, 'entrance', inside + rnd.int(45, 100) * MINUTE);
}

export function planVisits(t: Track, visitors: HistoryVisitor[], hosts: HistoryHost[], w: Window): PlannedVisit[] {
  const { rnd } = t;
  const visits: PlannedVisit[] = [];
  if (visitors.length === 0 || hosts.length === 0) return visits;
  let waited = false;
  const base = (v: HistoryVisitor, i: number) => {
    const host = hosts[i % hosts.length];
    return { visitorProfileId: v.profileId, identityId: v.identityId, hostProfileId: host.profileId, companyId: host.companyId, purpose: PURPOSES[i % PURPOSES.length] };
  };
  // Expected times are whole quarter hours: computed once without jitter, then floored.
  const exact = (date: string, minutes: number) => zonedTime(date, minutes, t.timezone);
  const slot = (date: string, minutes: number, hours: number) => {
    const at = exact(date, minutes);
    const start = at - (at % (15 * MINUTE));
    return { expectedStart: start, expectedEnd: start + hours * HOUR };
  };

  visitors.forEach((v, i) => {
    if (v.visitDate < w.first || v.visitDate > w.today) return;
    const day = weekday(v.visitDate);
    if (day === 7) {
      visits.push({ ...base(v, i), ...slot(v.visitDate, 660, 1), status: 'cancelled', cancellationReason: 'Rescheduled by the host' });
      return;
    }
    const arriveMinutes = day === 6 ? rnd.int(600, 690) : rnd.int(600, 930);
    const times = slot(v.visitDate, arriveMinutes, 2);
    if (!v.identityId) {
      // Without biometric consent the visit is real but nobody is tracked on camera.
      const noShow = v.visitDate < w.today && !visits.some((x) => x.status === 'scheduled');
      if (noShow) visits.push({ ...base(v, i), ...times, status: 'scheduled' });
      else if (!visits.some((x) => x.status === 'cancelled')) {
        visits.push({ ...base(v, i), ...times, status: 'cancelled', cancellationReason: 'Meeting moved online' });
      } else {
        const inAt = times.expectedStart + rnd.int(0, 20) * MINUTE;
        visits.push({ ...base(v, i), ...times, status: 'checked_out', checkedInAt: inAt, checkedOutAt: inAt + rnd.int(45, 110) * MINUTE, badgeNumber: `V-${1000 + i}` });
      }
      return;
    }
    const mark = t.out.length;
    const arrive = t.at(v.visitDate, arriveMinutes);
    const wait = !waited && day <= 5;
    const left = visitWalk(t, v.identityId, arrive, wait);
    if (left + 30_000 >= w.end) {
      // Later today: still expected.
      t.out.splice(mark);
      visits.push({ ...base(v, i), ...times, status: 'scheduled' });
      return;
    }
    waited ||= wait;
    visits.push({ ...base(v, i), ...times, status: 'checked_out', checkedInAt: arrive, checkedOutAt: left + 30_000, badgeNumber: `V-${1000 + i}` });
  });

  // A two-day visit checked in on the previous weekday and still on site.
  const guest = [...visitors].reverse().find((v) => v.identityId);
  const from = previousWeekday(w.today);
  if (guest?.identityId && from >= w.first) {
    const i = visitors.indexOf(guest);
    const arrive = t.at(from, rnd.int(570, 600));
    visitWalk(t, guest.identityId, arrive, false);
    t.enter(guest.identityId, 'entrance', t.at(w.today, rnd.int(560, 580)));
    visits.push({
      ...base(guest, i),
      purpose: 'Two-day audit',
      expectedStart: exact(from, 540),
      expectedEnd: exact(addDays(w.today, 1), 1080),
      status: 'checked_in',
      checkedInAt: arrive,
      badgeNumber: `V-${2000 + i}`,
    });
  }

  // Expected visits of the next days.
  let date = w.today;
  for (let n = 0; n < 3; n += 1) {
    date = addDays(date, 1);
    if (weekday(date) === 7) date = addDays(date, 1);
    const v = visitors[n % visitors.length];
    visits.push({ ...base(v, n + 3), ...slot(date, n % 2 === 0 ? 660 : 840, 1), status: 'scheduled' });
  }
  // Every status at least once: a no-show (expected two weekdays ago) and a cancellation.
  const noShowDay = previousWeekday(previousWeekday(w.today));
  if (!visits.some((x) => x.status === 'scheduled' && x.expectedEnd < w.end) && noShowDay >= w.first) {
    visits.push({ ...base(visitors[0], 1), ...slot(noShowDay, 900, 1), status: 'scheduled' });
  }
  if (!visits.some((x) => x.status === 'cancelled')) {
    visits.push({ ...base(visitors[0], 2), ...slot(addDays(w.today, 4), 600, 1), status: 'cancelled', cancellationReason: 'Meeting moved online' });
  }
  return visits;
}
