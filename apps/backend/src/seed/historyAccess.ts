import type { HistoryInput } from './historyPlan.js';
import type { PlannedDetection, Track } from './historyScripts.js';
import { addDays, localDate, localMinutes, weekdayOnOrBefore, zonedTime } from './historyTime.js';

/**
 * Physical access scenarios of the Nova Tower history (slice 8). The face-credential turnstiles decide every pass
 * through the real engine during the replay; regular days give the grants, the policy allows and the after-hours
 * denials (outside_schedule). These scenarios add the rarer decisions, on top of everything else (they run after the
 * visits are planned, so the rest of the plan is unchanged):
 * - the fire drill (fireDrill, an evacuation override seeded before the replay): a few office employees leave through
 *   the turnstiles during the 20 minutes (override_evacuation) and come back right after it (policy_allow);
 * - tailgating: an unknown face follows a known employee through the same turnstile 2 seconds later (one granted, one
 *   unknown_person: people 2 > granted 1);
 * - risk: an active contractor arrives before the contractor window (CONTRACTOR_WINDOW_START) and tries three
 *   turnstiles (outside_schedule), the fourth right after the window opens is refused by risk (three denials in the
 *   last 10 minutes: 0.45 > max_risk 0.4: risk_exceeded), the fifth a quarter of an hour later passes;
 * - the terminated contractor (seen once at the entrance and reception, historyCoverage) tries a turnstile
 *   (profile_inactive).
 */

const MINUTE = 60_000;

/** Contractors may pass the turnstiles from 07:30 (local minutes), weekdays. */
export const CONTRACTOR_WINDOW_START = 7 * 60 + 30;

export type FireDrill = { date: string; start: number; end: number };

/** The fire drill: 14:30-14:50 local on the weekday on or before ten days ago. */
export function fireDrill(today: string, timezone: string): FireDrill {
  const date = weekdayOnOrBefore(addDays(today, -10));
  const start = zonedTime(date, 14 * 60 + 30, timezone);
  return { date, start, end: start + 20 * MINUTE };
}

const isTurnstile = (d: PlannedDetection): boolean => d.point.startsWith('turnstile');

function seenOn(t: Track, identityId: string, date: string): PlannedDetection[] {
  return t.out.filter((d) => d.identityId === identityId && localDate(d.at, t.timezone) === date);
}

function evacuation(t: Track, input: HistoryInput, drill: FireDrill): void {
  const office = input.people.filter((p) => p.role === 'employee' && !p.guard && !p.night);
  // At work that afternoon: seen before 14:00 and after 15:30 local.
  const present = office.filter((p) => {
    const minutes = seenOn(t, p.identityId, drill.date).map((d) => localMinutes(d.at, t.timezone));
    return minutes.some((m) => m < 14 * 60) && minutes.some((m) => m > 15 * 60 + 30);
  });
  present.slice(0, 6).forEach((p, i) => {
    t.leave(p.identityId, 'entrance', drill.start + MINUTE + i * 35_000);
    t.enter(p.identityId, 'entrance', drill.end + 2 * MINUTE + i * 40_000);
  });
}

function tailgating(t: Track, input: HistoryInput, today: string, inWindow: (date: string) => boolean): void {
  const date = weekdayOnOrBefore(addDays(today, -5));
  const stranger = input.unknownIdentities.find((u) => u !== input.watchedIdentity);
  if (!stranger || !inWindow(date)) return;
  const office = new Set(input.people.filter((p) => p.role === 'employee' && !p.guard && !p.night).map((p) => p.identityId));
  const leader = t.out
    .filter((d) => office.has(d.identityId) && isTurnstile(d) && localDate(d.at, t.timezone) === date)
    .filter((d) => localMinutes(d.at, t.timezone) >= 8 * 60 + 30 && localMinutes(d.at, t.timezone) < 9 * 60 + 30)
    .sort((a, b) => a.at - b.at)[0];
  if (!leader) return;
  t.pass(stranger, leader.point, leader.at + 2_000, 1);
  t.pass(stranger, 'entrance', leader.at + 18 * MINUTE, 1);
}

function earlyContractor(t: Track, input: HistoryInput, today: string, inWindow: (date: string) => boolean): void {
  const contractors = input.people.filter(
    (p) => p.role === 'contractor' && (!p.activeFrom || p.activeFrom <= addDays(today, -10)) && (!p.activeTo || p.activeTo >= today),
  );
  // A weekday in the last two weeks the contractor is not on site otherwise.
  for (let back = 4; back <= 14; back += 1) {
    const date = weekdayOnOrBefore(addDays(today, -back));
    const contractor = contractors.find((p) => seenOn(t, p.identityId, date).length === 0);
    if (!contractor || !inWindow(date)) continue;
    const id = contractor.identityId;
    // 07:21 (+ up to a minute): attempts at +1, +4, +7 minutes (before 07:30), +10 (just after), +24.
    const base = t.at(date, CONTRACTOR_WINDOW_START - 9);
    t.pass(id, 'entrance', base, 1);
    t.pass(id, 'turnstile1', base + MINUTE, 1);
    t.pass(id, 'turnstile2', base + 4 * MINUTE, 1);
    t.pass(id, 'turnstile3', base + 7 * MINUTE, 1);
    t.pass(id, 'turnstile4', base + 10 * MINUTE, 1);
    t.pass(id, 'turnstile1', base + 24 * MINUTE, 1);
    t.leave(id, 'entrance', t.at(date, t.rnd.int(960, 1020)));
    return;
  }
}

function terminatedAttempt(t: Track, input: HistoryInput, today: string): void {
  const id = input.terminatedIdentity;
  if (!id) return;
  const date = weekdayOnOrBefore(addDays(today, -7));
  const reception = seenOn(t, id, date).filter((d) => d.point === 'reception').sort((a, b) => b.at - a.at)[0];
  if (reception) t.pass(id, t.turnstile(), reception.at + t.rnd.int(120, 200) * 1000, 1);
}

export function accessScenarios(t: Track, input: HistoryInput, today: string, inWindow: (date: string) => boolean): void {
  const drill = fireDrill(today, t.timezone);
  if (inWindow(drill.date)) evacuation(t, input, drill);
  tailgating(t, input, today, inWindow);
  earlyContractor(t, input, today, inWindow);
  terminatedAttempt(t, input, today);
}
