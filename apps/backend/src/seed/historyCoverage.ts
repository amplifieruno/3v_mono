import type { HistoryInput } from './historyPlan.js';
import type { Track } from './historyScripts.js';
import { addDays, weekdayOnOrBefore } from './historyTime.js';

/** Meeting Room 12A seats 12: one more attendee overfills it. */
export const MEETING_ATTENDEES = 13;

/**
 * History scenarios for the rarer event types (design §9: events of every type), on top of historyPlan's:
 * - occupancy_exceeded: a 13-person workshop in Meeting Room 12A (capacity 12), once, attendees with at least
 *   standard clearance (the room is restricted, so no restricted_area_entry);
 * - unusual_dwell (and loitering): an unknown face waiting 45 minutes in the lobby lounge (the published rule
 *   "Long wait in the lobby lounge" fires after 40 minutes);
 * - inactive_profile_detected: the contractor whose contract was terminated before the replay window, seen once at
 *   the entrance and the reception desk.
 * Device offline/online events come from the device health step (deviceHealth: record_device_health at past times).
 */
export function coverageScenarios(t: Track, input: HistoryInput, today: string, inWindow: (date: string) => boolean): void {
  const { rnd } = t;

  const attendees = input.people
    .filter((p) => p.role === 'employee' && !p.guard && p.clearance !== 'basic')
    .slice(0, MEETING_ATTENDEES);
  const workshop = weekdayOnOrBefore(addDays(today, -11));
  if (attendees.length === MEETING_ATTENDEES && inWindow(workshop)) {
    // 10:32, after every arrival and before lunch; all seated within about a minute.
    for (const p of attendees) t.pass(p.identityId, 'meeting', t.at(workshop, 10 * 60 + 32), 2);
  }

  const waiting = [...input.unknownIdentities].reverse().find((u) => u !== input.watchedIdentity);
  const waitDay = weekdayOnOrBefore(addDays(today, -3));
  if (waiting && inWindow(waitDay)) {
    const arrived = t.pass(waiting, 'entrance', t.at(waitDay, 10 * 60 + 5));
    const left = t.linger(waiting, 'lounge', arrived + rnd.int(40, 90) * 1000, 45);
    t.pass(waiting, 'entrance', left + rnd.int(60, 120) * 1000);
  }

  const terminated = input.terminatedIdentity;
  const sighting = weekdayOnOrBefore(addDays(today, -7));
  if (terminated && inWindow(sighting)) {
    const arrived = t.pass(terminated, 'entrance', t.at(sighting, 9 * 60 + 40));
    t.pass(terminated, 'reception', arrived + rnd.int(40, 80) * 1000);
  }
}
