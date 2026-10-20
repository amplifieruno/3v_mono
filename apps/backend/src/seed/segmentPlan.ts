import { addDays, localDate, zonedTime } from './historyTime.js';
import { SECURITY_TEAM } from './notificationPlan.js';

/**
 * Segments of the seed (design §6.5, §9; slice 6): system templates for both targets, the Nova Tower segments and one
 * Riverside segment, the manual memberships, the times the history is evaluated at and the two rules that use
 * segments. Pure data; written by segments.ts / segmentHistory.ts.
 */
export type SegmentTarget = 'profiles' | 'identities';
type Leaf = { field: string; operator: string; value: unknown };
type Group = { op: 'and' | 'or' | 'not'; children: Condition[] };
export type Condition = Leaf | Group;
export type Window = { days: number[]; from: string; to: string };

const leaf = (field: string, operator: string, value: unknown): Leaf => ({ field, operator, value });
const and = (...children: Condition[]): Group => ({ op: 'and', children });
const or = (...children: Condition[]): Group => ({ op: 'or', children });

export type TemplateSpec = { name: string; description: string; target: SegmentTarget; category: string; conditions: Condition };

/** System templates (is_system), the same set in every seeded organization. */
export const SEGMENT_TEMPLATES: TemplateSpec[] = [
  {
    name: 'Frequent visitors',
    description: 'On site on at least 8 days in the last 30',
    target: 'profiles',
    category: 'behavior',
    conditions: leaf('visits_last_30d', 'gte', 8),
  },
  {
    name: 'Inactive for 30 days',
    description: 'Active profiles not seen for 30 days or never seen',
    target: 'profiles',
    category: 'behavior',
    conditions: and(leaf('status', 'eq', 'active'), or(leaf('last_seen_days_ago', 'gte', 30), leaf('last_seen_days_ago', 'is_null', true))),
  },
  {
    name: 'Contractors ending soon',
    description: 'Active contractors whose access ends within 30 days',
    target: 'profiles',
    category: 'lifecycle',
    conditions: and(
      leaf('profile_type', 'eq', 'contractor'),
      leaf('status', 'eq', 'active'),
      leaf('end_date', 'between', [{ relative_days: 0 }, { relative_days: 30 }]),
    ),
  },
  {
    name: 'On shift now',
    description: 'Profiles whose work schedule covers the current time',
    target: 'profiles',
    category: 'schedule',
    conditions: leaf('on_shift_now', 'eq', true),
  },
  {
    name: 'Unknown frequent faces',
    description: 'Unlinked faces seen on at least 3 days in the last 30',
    target: 'identities',
    category: 'behavior',
    conditions: and(leaf('linked', 'eq', false), leaf('visits_last_30d', 'gte', 3)),
  },
  {
    name: 'New faces this week',
    description: 'Identities first seen in the last 7 days',
    target: 'identities',
    category: 'lifecycle',
    conditions: leaf('first_seen_at', 'gte', { relative_days: -7 }),
  },
  {
    name: 'After-hours regulars',
    description: 'Identities seen after hours at least twice in the last 30 days',
    target: 'identities',
    category: 'behavior',
    conditions: leaf('after_hours_visits_30d', 'gte', 2),
  },
];

export const SEGMENT_NAMES = {
  nightShift: 'Night shift',
  frequent: 'Frequent visitors',
  vip: 'VIP',
  contractorsEnding: 'Contractors ending soon',
  unknownFrequent: 'Unknown frequent faces',
  executive: 'Executive floor access',
  parking: 'Parking permit holders',
  fitOut: 'Floor 12 fit-out crew',
  weekend: 'Weekend presence',
  riversideSecurity: 'Security staff',
  // Slice 9: the populations of the face authentication client apps (the sandbox segment is seeded with them).
  employees: 'Employees',
  visitors: 'Visitors',
  sandbox: 'Sandbox test identities',
} as const;

export type SegmentSpec = {
  name: string;
  description: string;
  color: string;
  icon: string;
  kind: 'manual' | 'dynamic';
  target: SegmentTarget;
  conditions: Condition | Record<string, never>;
  status: 'active' | 'inactive';
  activeFrom: number | null;
  activeUntil: number | null;
  schedule: Window[] | null;
  /** Name of the template it was created from. */
  template: string | null;
};

const DAY_MS = 86_400_000;

function dynamic(spec: Omit<SegmentSpec, 'kind' | 'status' | 'activeFrom' | 'activeUntil' | 'schedule' | 'template'> & Partial<SegmentSpec>): SegmentSpec {
  return { kind: 'dynamic', status: 'active', activeFrom: null, activeUntil: null, schedule: null, template: null, ...spec };
}

/** Ids the Nova Tower conditions reference. */
export type SegmentRefs = { nightShiftSchedule: string; fitOutCompany: string };

/**
 * Nova Tower: Night shift (work schedule), Frequent visitors (non-employees on site on 6+ days of 30), VIP (profile
 * type), Contractors ending soon (relative end date), Unknown frequent faces (identities), the manual Executive floor
 * access list, Parking permit holders (inactive), the Floor 12 fit-out crew (active window: the renovation),
 * Employees and Visitors (the face authentication populations, slice 9) and Weekend presence (schedule: Saturdays and
 * Sundays).
 */
export function novaSegments(refs: SegmentRefs, args: { now: number }): SegmentSpec[] {
  const contractorsEnding = SEGMENT_TEMPLATES.find((t) => t.name === 'Contractors ending soon');
  const unknownFrequent = SEGMENT_TEMPLATES.find((t) => t.name === 'Unknown frequent faces');
  if (!contractorsEnding || !unknownFrequent) throw new Error('seed: segment templates missing');
  return [
    dynamic({
      name: SEGMENT_NAMES.nightShift, description: 'Staff on the Night Shift work schedule', color: '#1e3a8a', icon: 'moon', target: 'profiles',
      conditions: leaf('work_schedule_id', 'eq', refs.nightShiftSchedule),
    }),
    dynamic({
      name: SEGMENT_NAMES.frequent, description: 'Contractors, VIPs and visitors on site on at least 6 days in the last 30', color: '#0d9488',
      icon: 'repeat', target: 'profiles', template: 'Frequent visitors',
      conditions: and(leaf('profile_type', 'neq', 'employee'), leaf('visits_last_30d', 'gte', 6)),
    }),
    dynamic({
      name: SEGMENT_NAMES.vip, description: 'Active VIP profiles', color: '#7c3aed', icon: 'crown', target: 'profiles',
      conditions: and(leaf('profile_type', 'eq', 'vip'), leaf('status', 'eq', 'active')),
    }),
    dynamic({
      name: SEGMENT_NAMES.contractorsEnding, description: contractorsEnding.description, color: '#ea580c', icon: 'hourglass',
      target: 'profiles', template: contractorsEnding.name, conditions: contractorsEnding.conditions,
    }),
    dynamic({
      name: SEGMENT_NAMES.unknownFrequent, description: unknownFrequent.description, color: '#dc2626', icon: 'scan-face',
      target: 'identities', template: unknownFrequent.name, conditions: unknownFrequent.conditions,
    }),
    {
      name: SEGMENT_NAMES.executive, description: 'Hand-picked holders of executive floor (Floor 24) access', color: '#ca8a04', icon: 'key-round',
      kind: 'manual', target: 'profiles', conditions: {}, status: 'active', activeFrom: null, activeUntil: null, schedule: null, template: null,
    },
    dynamic({
      name: SEGMENT_NAMES.parking, description: 'Profiles with a parking spot (paused until the new parking system goes live)',
      color: '#64748b', icon: 'car', target: 'profiles', status: 'inactive',
      conditions: leaf('custom_fields.parking_spot', 'is_null', false),
    }),
    dynamic({
      name: SEGMENT_NAMES.fitOut, description: 'Lumen Electrical Works contractors during the Floor 12 renovation', color: '#2563eb',
      icon: 'hard-hat', target: 'profiles',
      activeFrom: args.now - 20 * DAY_MS, activeUntil: args.now + 10 * DAY_MS,
      conditions: and(leaf('profile_type', 'eq', 'contractor'), leaf('company_id', 'eq', refs.fitOutCompany)),
    }),
    dynamic({
      name: SEGMENT_NAMES.employees, description: 'Active employee profiles (face authentication: Lobby Kiosk, HR Portal)',
      color: '#0369a1', icon: 'briefcase', target: 'profiles',
      conditions: and(leaf('profile_type', 'eq', 'employee'), leaf('status', 'eq', 'active')),
    }),
    dynamic({
      name: SEGMENT_NAMES.visitors, description: 'Active visitor profiles (face authentication: Visitor Check-in)',
      color: '#9333ea', icon: 'user-round-check', target: 'profiles',
      conditions: and(leaf('profile_type', 'eq', 'visitor'), leaf('status', 'eq', 'active')),
    }),
    dynamic({
      name: SEGMENT_NAMES.weekend, description: 'People seen in the last 24 hours, evaluated on weekends only', color: '#16a34a',
      icon: 'calendar-days', target: 'profiles', schedule: [{ days: [6, 7], from: '00:00', to: '24:00' }],
      conditions: leaf('last_seen_days_ago', 'eq', 0),
    }),
  ];
}

/** Riverside: one small attribute segment. */
export function riversideSegments(): SegmentSpec[] {
  return [
    dynamic({
      name: SEGMENT_NAMES.riversideSecurity, description: 'Security department staff', color: '#0f766e', icon: 'shield',
      target: 'profiles', conditions: leaf('department', 'eq', 'Security'),
    }),
  ];
}

/**
 * When the history is evaluated: a minute after the segments were created, at 23:59:59 local of every date from the
 * creation date to yesterday, and at `now`. Daily stats are computed at every day end and at `now` (the creation
 * day's row comes from its day end).
 */
export function segmentHistoryTimes(args: { createdAt: number; now: number; timezone: string }): { evaluations: number[]; stats: number[] } {
  const first = Math.min(args.createdAt + 60_000, args.now);
  const dayEnds: number[] = [];
  for (let date = localDate(args.createdAt, args.timezone); ; date = addDays(date, 1)) {
    const end = zonedTime(addDays(date, 1), 0, args.timezone) - 1000;
    if (end >= args.now) break;
    if (end > first) dayEnds.push(end);
  }
  const evaluations = first < args.now ? [first, ...dayEnds, args.now] : [args.now];
  return { evaluations, stats: [...dayEnds, args.now] };
}

export type ManualMember = { profileId: string; addedAt: number; removedAt: number | null };

const HOUR_MS = 3_600_000;

/** 10:00 local, `days` days before the local date of now. */
function morning(now: number, days: number, timezone: string): number {
  return zonedTime(addDays(localDate(now, timezone), -days), 10 * 60, timezone);
}

/**
 * Executive floor access (manual, added by the admin): the VIPs and the security chief two hours after the segment
 * was created; one assistant from day -18 to day -5 (removed), another one since day -3.
 */
export function executiveMembers(args: {
  vips: string[];
  securityChief: string | null;
  assistants: string[];
  createdAt: number;
  now: number;
  timezone: string;
}): ManualMember[] {
  const atStart = args.createdAt + 2 * HOUR_MS;
  const founders = [...args.vips, ...(args.securityChief ? [args.securityChief] : [])];
  const [first, second] = args.assistants;
  return [
    ...founders.map((profileId) => ({ profileId, addedAt: atStart, removedAt: null })),
    ...(first ? [{ profileId: first, addedAt: morning(args.now, 18, args.timezone), removedAt: morning(args.now, 5, args.timezone) }] : []),
    ...(second ? [{ profileId: second, addedAt: morning(args.now, 3, args.timezone), removedAt: null }] : []),
  ];
}

/** A visitor the admin pinned to the frequent visitors ten days ago (manual row on a dynamic segment). */
export function frequentVisitorPin(profileId: string, args: { now: number; timezone: string }): ManualMember {
  return { profileId, addedAt: morning(args.now, 10, args.timezone), removedAt: null };
}

/** Event rule with a segment scope (and the facility): published at seed time, effective live. */
export const SEGMENT_EVENT_RULE = {
  name: 'Fit-out crew after hours',
  description: 'Floor 12 fit-out contractors seen outside the facility operating hours',
  rule_type: 'after_hours',
  severity: 'medium',
  creates_incident: false,
  parameters: {},
  segment: SEGMENT_NAMES.fitOut,
} as const;

/** Notification rule with a segment_id condition (and the facility): created at seed time, effective live. */
export const SEGMENT_NOTIFICATION_RULE = {
  name: 'Executive access holders',
  description: 'Security team inbox: arrivals, after-hours presence and restricted-area entries of executive floor access holders',
  eventTypes: ['vip_arrival', 'after_hours', 'restricted_area_entry'],
  channels: ['in_app'],
  group: SECURITY_TEAM,
  template: 'generic',
  priority: 'medium',
  segment: SEGMENT_NAMES.executive,
} as const;
