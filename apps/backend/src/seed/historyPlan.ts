import { seededRandom } from './random.js';
import {
  contractorDay,
  guardDay,
  officeDay,
  saturdayDay,
  strangerVisit,
  Track,
  vipMorning,
  type HistoryPerson,
  type PlannedDetection,
} from './historyScripts.js';
import { addDays, localDate, replayDays, weekday, type ReplayDay } from './historyTime.js';
import { planVisits, type HistoryHost, type HistoryVisitor, type PlannedVisit } from './historyVisits.js';

export type { HistoryPerson, PlannedDetection } from './historyScripts.js';
export type { HistoryHost, HistoryVisitor, PlannedVisit } from './historyVisits.js';

/**
 * 30 days of plausible camera history of Nova Tower (seed, design §9), as detections to replay through the real
 * pipeline in time order (historyReplay). Office days through the entrance or parking gate and the turnstiles, day
 * security rounds, contractors via reception, VIP mornings, visitors (historyVisits) and the scenarios that produce
 * the alert events: the blacklisted person twice at the loading dock (once at night, once loitering), unknown faces,
 * a watched unknown face, a couple of after-hours entries, one server-room entry without clearance and one
 * contractor at the loading dock. Deterministic for the same input.
 */
export type HistoryInput = {
  now: Date;
  timezone: string;
  people: HistoryPerson[];
  visitors: HistoryVisitor[];
  hosts: HistoryHost[];
  blacklistedIdentity: string | null;
  unknownIdentities: string[];
  watchedIdentity: string | null;
};

export type HistoryPlan = { days: ReplayDay[]; detections: PlannedDetection[]; visits: PlannedVisit[] };

/** Latest date on or before `date` that is a weekday (Mon–Fri). */
function weekdayOnOrBefore(date: string): string {
  let d = date;
  while (weekday(d) > 5) d = addDays(d, -1);
  return d;
}

function regularDays(t: Track, input: HistoryInput, days: ReplayDay[]): void {
  const { rnd } = t;
  for (const { date } of days) {
    const day = weekday(date);
    for (const p of input.people) {
      if (p.activeFrom && date < p.activeFrom) continue;
      if (p.activeTo && date > p.activeTo) continue;
      if (p.guard) {
        if (day <= 6) guardDay(t, p, date);
        continue;
      }
      if (p.role === 'vip') {
        if ([1, 3, 5].includes(day) && rnd.chance(0.85)) vipMorning(t, p, date, p.car);
        continue;
      }
      if (p.role === 'contractor') {
        if (day <= 5 && rnd.chance(0.35)) contractorDay(t, p, date);
        continue;
      }
      if (day <= 5 && rnd.chance(0.93)) officeDay(t, p, date);
      else if (day === 6 && rnd.chance(0.04)) saturdayDay(t, p, date);
    }
  }
}

function scenarios(t: Track, input: HistoryInput, today: string, first: string): void {
  const { rnd } = t;
  const inWindow = (date: string): boolean => date >= first && date < today;
  const office = input.people.filter((p) => p.role === 'employee' && !p.guard);

  // The blacklisted person: at the loading dock at night (after hours) and, days later, loitering there.
  if (input.blacklistedIdentity) {
    const night = addDays(today, -12);
    if (inWindow(night)) t.pass(input.blacklistedIdentity, 'dock', t.at(night, 23 * 60 + 10), 2);
    const day = weekdayOnOrBefore(addDays(today, -4));
    if (inWindow(day)) t.linger(input.blacklistedIdentity, 'dock', t.at(day, 14 * 60 + 20), 14);
  }

  // After hours: an employee back at 22:40 on a weekday, another one on a Sunday.
  const late = office.find((p) => p.clearance !== 'basic');
  const lateDay = weekdayOnOrBefore(addDays(today, -9));
  if (late && inWindow(lateDay)) {
    t.enter(late.identityId, 'entrance', t.at(lateDay, 22 * 60 + 40));
    t.leave(late.identityId, 'entrance', t.at(lateDay, 23 * 60 + 20));
  }
  const sundayWorker = office.filter((p) => p.clearance !== 'basic')[1];
  let sunday = addDays(today, -1);
  while (weekday(sunday) !== 7) sunday = addDays(sunday, -1);
  if (sundayWorker && inWindow(sunday)) {
    t.enter(sundayWorker.identityId, 'entrance', t.at(sunday, 11 * 60 + 15));
    t.leave(sundayWorker.identityId, 'entrance', t.at(sunday, 13 * 60 + 40));
  }

  // A basic-clearance employee in the secure server room, once.
  const intruder = office.find((p) => p.clearance === 'basic' && !p.dockDuty);
  const breach = weekdayOnOrBefore(addDays(today, -6));
  if (intruder && inWindow(breach)) t.pass(intruder.identityId, 'serverRoom', t.at(breach, 15 * 60 + 10), 2);

  // A basic-clearance contractor at the (restricted) loading dock, once.
  const courier = input.people.find((p) => p.role === 'contractor' && (!p.activeFrom || p.activeFrom <= addDays(today, -15)));
  const dockDay = weekdayOnOrBefore(addDays(today, -15));
  if (courier && inWindow(dockDay)) t.pass(courier.identityId, 'dock', t.at(dockDay, 13 * 60 + 30), 2);

  // Restricted-floor entries that open incidents: the same contractor at the executive floor door (day -2) and an
  // unknown face in the server room (day -20).
  const exec = weekdayOnOrBefore(addDays(today, -2));
  if (courier && inWindow(exec)) {
    const turned = t.enter(courier.identityId, 'entrance', t.at(exec, 11 * 60 + 5));
    t.pass(courier.identityId, 'executive', turned + 3 * 60_000, 1);
  }
  const lost = input.unknownIdentities.find((u) => u !== input.watchedIdentity);
  const serverDay = weekdayOnOrBefore(addDays(today, -20));
  if (lost && inWindow(serverDay)) t.pass(lost, 'serverRoom', t.at(serverDay, 19 * 60 + 40), 2);

  // Unknown faces a few times each (one of them once at the loading dock); the watched one three times.
  const weekdays: string[] = [];
  for (let d = first; d < today; d = addDays(d, 1)) if (weekday(d) <= 5) weekdays.push(d);
  const strangers = [...input.unknownIdentities];
  if (input.watchedIdentity && !strangers.includes(input.watchedIdentity)) strangers.push(input.watchedIdentity);
  for (const identity of strangers) {
    const visits = new Set<string>();
    while (visits.size < Math.min(3, weekdays.length)) visits.add(rnd.pick(weekdays));
    for (const date of [...visits].sort()) strangerVisit(t, identity, date);
  }
  const atDock = input.unknownIdentities.find((u) => u !== input.watchedIdentity);
  const dockVisit = weekdayOnOrBefore(addDays(today, -8));
  if (atDock && inWindow(dockVisit)) t.pass(atDock, 'dock', t.at(dockVisit, 15 * 60 + 40), 2);
}

export function buildHistoryPlan(input: HistoryInput): HistoryPlan {
  const days = replayDays(input.now, input.timezone);
  const t = new Track(seededRandom('nova-tower:history'), input.timezone);
  const today = localDate(input.now.getTime(), input.timezone);
  const start = days[0]?.start ?? 0;
  const end = days[days.length - 1]?.end ?? 0;

  regularDays(t, input, days);
  scenarios(t, input, today, days[0]?.date ?? today);
  const visits = planVisits(t, input.visitors, input.hosts, { today, end, first: days[0]?.date ?? today });

  const detections = t.out
    .filter((d) => d.at >= start && d.at < end)
    .sort((a, b) => a.at - b.at || (a.identityId < b.identityId ? -1 : a.identityId > b.identityId ? 1 : 0));
  return { days, detections, visits };
}
