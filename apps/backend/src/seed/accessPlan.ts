import { CONTRACTOR_WINDOW_START } from './historyAccess.js';
import { addDays, localDate, weekday, zonedTime } from './historyTime.js';
import type { PlannedVisit } from './historyVisits.js';

/**
 * Physical access configuration of the seed (slice 8, design §6.13, §9): pure data, written by access.ts /
 * accessPolicies.ts through the real functions (four-eyes: drafts are submitted by one Nova admin and approved by the
 * other).
 *
 * Before the replay (the history's decisions come from these): face credential on the turnstiles and the server room
 * door (camera-bound), the "IT and server room staff" segment and the published policies Employees (turnstiles,
 * office hours), Contractors (turnstiles, weekdays, max_risk), Security and night operations (24/7), the server room
 * pair, plus the visitors' day grants from their visits (Elevator Hall: all four turnstiles, the area behind them) and
 * the fire drill. After the segments step: the executive floor policy (segment subject), one pending and one draft.
 *
 * Server room, deterministic: the IT allow has priority 500, the "everyone else" deny 400. The engine sorts by
 * priority first, so a member of the IT segment matches the allow before the deny; every other profile type reaches
 * the deny; a face without a profile has no rule (unknown_person).
 *
 * Contractors' max_risk is 0.4 rather than 0.6: the seeded risk components are over capacity 0.3, recent denials
 * 0.15 each (at most 0.45), device health (the Lobby Camera's live state: 0-0.3) and no profile 0.4; only three
 * recent denials reach the limit deterministically, so 0.6 could only be exceeded through the camera's live health.
 */
export type Window = { days: number[]; from: string; to: string };

export type SubjectRef =
  | { profile_type: 'employee' | 'contractor' | 'visitor' | 'vip' }
  | { access_level: 'basic' | 'standard' | 'elevated' }
  | { segment: string }
  /** One profile subject per member of a seeded group (resolved by access.ts). */
  | { group: 'operations' };

export type TargetRef = { access_point: string } | { area: string } | { facility: true };

export type PolicyStage = 'published' | 'pending' | 'draft';

export type PolicySpec = {
  name: string;
  description: string;
  effect: 'allow' | 'deny';
  priority: number;
  schedule: Window[] | null;
  maxRisk: number | null;
  subjects: SubjectRef[];
  targets: TargetRef[];
  stage: PolicyStage;
};

const WEEKDAYS = [1, 2, 3, 4, 5];
const hhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export const IT_SEGMENT = {
  name: 'IT and server room staff',
  description: 'Hand-picked holders of server room access (IT engineers and the security chief)',
  color: '#0891b2',
  icon: 'server',
} as const;

/** Access points that decide by face: their bound camera's detections go through the engine (Stage B). */
export const FACE_CREDENTIAL_DOORS = ['Turnstile 1', 'Turnstile 2', 'Turnstile 3', 'Turnstile 4', 'Server Room Door'];
const TURNSTILES = FACE_CREDENTIAL_DOORS.filter((name) => name.startsWith('Turnstile')).map((access_point) => ({ access_point }));

/** The visitors' day grants cover the area behind the turnstiles (all four of them). */
export const VISITOR_GRANT_AREA = 'Nova Tower/Lobby/Elevator Hall';
/** Goes offline before the replay (never synced; reported stale and out of the convergence bound). */
export const OFFLINE_TERMINAL = 'Turnstile Terminal 4';

export const POLICY_NAMES = {
  employees: 'Employees: main turnstiles',
  contractors: 'Contractors: weekdays',
  operations: 'Security and night operations: 24/7',
  serverRoomIt: 'Server room: IT staff',
  serverRoomOthers: 'Server room: everyone else',
  executive: 'Executive floor: access holders',
  parking: 'Parking gate: tenant staff',
  dock: 'Loading dock: morning deliveries',
  riverside: 'Staff: front door',
} as const;

/** Published before the replay: the policies the history's decisions are made by. */
export function historyPolicies(): PolicySpec[] {
  return [
    {
      name: POLICY_NAMES.employees, description: 'Tenant staff and executives through the main turnstiles during office hours',
      effect: 'allow', priority: 100, schedule: [{ days: WEEKDAYS, from: '06:00', to: '22:00' }], maxRisk: null,
      subjects: [{ profile_type: 'employee' }, { profile_type: 'vip' }], targets: TURNSTILES, stage: 'published',
    },
    {
      name: POLICY_NAMES.contractors, description: 'Contractors on weekdays; refused when the risk score is above 0.4',
      effect: 'allow', priority: 100, schedule: [{ days: WEEKDAYS, from: hhmm(CONTRACTOR_WINDOW_START), to: '19:00' }], maxRisk: 0.4,
      subjects: [{ profile_type: 'contractor' }], targets: TURNSTILES, stage: 'published',
    },
    {
      name: POLICY_NAMES.operations, description: 'Security staff and the night shift at any time',
      effect: 'allow', priority: 200, schedule: null, maxRisk: null,
      subjects: [{ group: 'operations' }], targets: TURNSTILES, stage: 'published',
    },
    {
      name: POLICY_NAMES.serverRoomIt, description: 'Members of the IT and server room staff segment (decides before the deny below)',
      effect: 'allow', priority: 500, schedule: null, maxRisk: null,
      subjects: [{ segment: IT_SEGMENT.name }], targets: [{ access_point: 'Server Room Door' }], stage: 'published',
    },
    {
      name: POLICY_NAMES.serverRoomOthers, description: 'Every other profile is refused at the server room door',
      effect: 'deny', priority: 400, schedule: null, maxRisk: null,
      subjects: [{ profile_type: 'employee' }, { profile_type: 'contractor' }, { profile_type: 'visitor' }, { profile_type: 'vip' }],
      targets: [{ access_point: 'Server Room Door' }], stage: 'published',
    },
  ];
}

/** Written after the segments step (the executive floor list is a slice-6 segment); none of them decides history. */
export function livePolicies(): PolicySpec[] {
  return [
    {
      name: POLICY_NAMES.executive, description: 'Holders of executive floor access (manual segment) at the executive floor door',
      effect: 'allow', priority: 300, schedule: null, maxRisk: null,
      subjects: [{ segment: 'Executive floor access' }], targets: [{ access_point: 'Executive Floor Door' }], stage: 'published',
    },
    {
      name: POLICY_NAMES.parking, description: 'Tenant staff at the parking gate, Monday to Saturday (awaiting the second approval)',
      effect: 'allow', priority: 100, schedule: [{ days: [1, 2, 3, 4, 5, 6], from: '06:00', to: '23:00' }], maxRisk: null,
      subjects: [{ profile_type: 'employee' }, { profile_type: 'vip' }], targets: [{ access_point: 'Parking Gate' }], stage: 'pending',
    },
    {
      name: POLICY_NAMES.dock, description: 'Contractors with elevated clearance at the loading dock in the morning (draft)',
      effect: 'allow', priority: 100, schedule: [{ days: WEEKDAYS, from: '06:00', to: '10:00' }], maxRisk: 0.5,
      subjects: [{ access_level: 'elevated' }], targets: [{ access_point: 'Loading Dock Door' }], stage: 'draft',
    },
  ];
}

/** Riverside: one simple published policy. */
export function riversidePolicies(): PolicySpec[] {
  return [
    {
      name: POLICY_NAMES.riverside, description: 'Employees at the front door on weekdays',
      effect: 'allow', priority: 100, schedule: [{ days: WEEKDAYS, from: '07:00', to: '20:00' }], maxRisk: null,
      subjects: [{ profile_type: 'employee' }], targets: [{ access_point: 'Front Door' }], stage: 'published',
    },
  ];
}

export type PlannedGrant = {
  profileId: string;
  validFrom: number;
  validUntil: number;
  singleUse: boolean;
  reason: string;
  createdAt: number;
};

/**
 * One day grant per visit that was not cancelled (07:00 of the first visit day to 21:00 of the last, local), created
 * with the visit. The first tracked visit that was checked out gets a single-use grant instead: consumed at the
 * turnstile on the way in, so the way out is refused (no_rule).
 */
export function visitGrants(visits: PlannedVisit[], timezone: string, now: number): PlannedGrant[] {
  const single = visits.find((v) => v.status === 'checked_out' && v.identityId);
  return visits
    .filter((v) => v.status !== 'cancelled')
    .map((v) => ({
      profileId: v.visitorProfileId,
      validFrom: zonedTime(localDate(v.expectedStart, timezone), 7 * 60, timezone),
      validUntil: zonedTime(localDate(v.expectedEnd, timezone), 21 * 60, timezone),
      singleUse: v === single,
      reason: v === single ? `Single entry: ${v.purpose}` : `Visit: ${v.purpose}`,
      createdAt: Math.min(now, v.expectedStart - 36 * 3_600_000),
    }));
}

/** A contractor's server room maintenance slot next week (09:00-12:00 on the first weekday after 4 days), revoked. */
export function maintenanceGrant(today: string, timezone: string): { validFrom: number; validUntil: number } {
  let date = addDays(today, 5);
  while (weekday(date) > 5) date = addDays(date, 1);
  return { validFrom: zonedTime(date, 9 * 60, timezone), validUntil: zonedTime(date, 12 * 60, timezone) };
}
