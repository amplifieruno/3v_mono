import type { HistoryInput } from './historyPlan.js';
import type { HistoryPerson, PointKey, Track } from './historyScripts.js';
import { addDays, weekdayOnOrBefore } from './historyTime.js';

/**
 * Unusual routes for abnormal_movement in the history (slice 7): Stage B flags a transition between two busy areas
 * that was seen at most once in the 30 days before (area_transitions_daily, aggregated per replayed day). Regular
 * days only walk door -> turnstiles -> door (and reception, lounge, executive floor for their people), so these
 * eight detours on eight weekdays of the last three weeks give a few abnormal_movement events a week:
 * the parking driver who picks up a guest badge at reception, the employee who walks back from the turnstiles to
 * reception and out, people crossing between the parking gate and the main entrance, and a contractor who walks
 * straight out again after signing in. Each route is one session (the stops are a minute or two apart).
 */
type Route = { daysAgo: number; minutes: number; who: 'driver' | 'walker' | 'contractor'; stops: PointKey[] };

const ROUTES: Route[] = [
  { daysAgo: 22, minutes: 12 * 60 + 10, who: 'driver', stops: ['parking', 'reception', 'turnstile1'] },
  { daysAgo: 20, minutes: 15 * 60 + 40, who: 'walker', stops: ['turnstile2', 'reception', 'entrance'] },
  { daysAgo: 18, minutes: 11 * 60 + 25, who: 'walker', stops: ['entrance', 'parking'] },
  { daysAgo: 15, minutes: 14 * 60 + 5, who: 'contractor', stops: ['reception', 'entrance'] },
  { daysAgo: 11, minutes: 13 * 60 + 50, who: 'driver', stops: ['parking', 'entrance'] },
  { daysAgo: 8, minutes: 10 * 60 + 35, who: 'driver', stops: ['parking', 'reception', 'turnstile3'] },
  { daysAgo: 5, minutes: 16 * 60 + 15, who: 'walker', stops: ['turnstile4', 'reception', 'entrance'] },
  { daysAgo: 2, minutes: 12 * 60 + 45, who: 'walker', stops: ['entrance', 'parking'] },
];

export function unusualRoutes(t: Track, input: HistoryInput, today: string, inWindow: (date: string) => boolean): void {
  const office = input.people.filter((p) => p.role === 'employee' && !p.guard && !p.night);
  const pool: Record<Route['who'], HistoryPerson[]> = {
    driver: office.filter((p) => p.car),
    walker: office.filter((p) => !p.car),
    contractor: input.people.filter(
      (p) => p.role === 'contractor' && (!p.activeFrom || p.activeFrom <= addDays(today, -20)) && (!p.activeTo || p.activeTo >= today),
    ),
  };
  ROUTES.forEach((route, i) => {
    const people = pool[route.who];
    const person = people[(i * 7) % Math.max(people.length, 1)];
    const date = weekdayOnOrBefore(addDays(today, -route.daysAgo));
    if (!person || !inWindow(date)) return;
    let at = t.at(date, route.minutes);
    for (const stop of route.stops) at = t.pass(person.identityId, stop, at, 1) + t.rnd.int(60, 120) * 1000;
  });
}
