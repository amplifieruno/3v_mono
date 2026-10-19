import { randomUUID } from 'node:crypto';
import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { floorName } from './facilityPlan.js';
import { buildDayMutation, type ResolvedPoint } from './historyMutation.js';
import type { HistoryPlan, PlannedVisit } from './historyPlan.js';
import type { PointKey } from './historyScripts.js';
import type { SeedContext } from './tenancy.js';

/**
 * Replays the history plan through the real pipeline (design §9): visits first (Stage A links sessions to them),
 * then one transaction per simulated day (historyMutation): detections through Stage A, Stage B evaluate_detection
 * called synchronously (the detection_created event trigger re-runs it asynchronously; it is idempotent), dwell
 * rules / stale sessions at simulated times and the daily lifecycle job (no-show visits).
 *
 * Idempotency: the replay is skipped when the organization already has a detection older than the marker age (the
 * first replayed day always has one; live recognition never writes the past). Each day is one transaction, so a
 * replay that fails part-way keeps the days already committed (including that first day, which carries the marker):
 * the next run then reports the history as seeded and does NOT resume, leaving a truncated history. Recover with
 * `pnpm seed --reset`. Without the marker but with any detection or session from the replay period on (live
 * recognition), the replay is skipped and the seed says the history needs `pnpm seed --reset`: no interleaving.
 */
export type ReplayResult = {
  skipped: false | 'seeded' | 'needs_reset';
  days: number;
  detections: number;
  visits: number;
  durationMs: number;
};

/**
 * `seeded`: the history marker exists. `needs_reset`: no marker but tracking data from the replay period or later
 * (live recognition, an interrupted replay): replaying would interleave with it, so the seed asks for --reset.
 */
export function replayDecision(state: { seeded: boolean; newerData: boolean }): 'replay' | 'seeded' | 'needs_reset' {
  if (state.seeded) return 'seeded';
  return state.newerData ? 'needs_reset' : 'replay';
}

const MARKER_AGE_MS = 29 * 86_400_000;

const MARKER = `
  query SeedHistoryMarker($org: uuid!, $before: timestamptz!, $start: timestamptz!) {
    marker: detections(where: { organization_id: { _eq: $org }, detected_at: { _lt: $before } }, limit: 1) { id }
    newer: detections(where: { organization_id: { _eq: $org }, detected_at: { _gte: $start } }, limit: 1) { id }
    sessions: tracking_sessions(where: { organization_id: { _eq: $org }, last_detected_at: { _gte: $start } }, limit: 1) { id }
    visits(where: { organization_id: { _eq: $org } }, limit: 1) { id }
  }
`;
const ACCESS_POINTS = `
  query SeedHistoryAccessPoints($facility: uuid!) { access_points(where: { facility_id: { _eq: $facility } }) { id name } }
`;
const INSERT_VISITS = `
  mutation SeedHistoryVisits($objects: [visits_insert_input!]!) { insert_visits(objects: $objects) { affected_rows } }
`;

const LOBBY = 'Nova Tower/Lobby';
const POINT_SPECS: Record<PointKey, { device: string; area: string; accessPoint: string | null }> = {
  entrance: { device: 'Main Entrance Camera', area: `${LOBBY}/Main Entrance`, accessPoint: 'Main Entrance Doors' },
  turnstile1: { device: 'Lobby Camera', area: `${LOBBY}/Turnstile Gallery`, accessPoint: 'Turnstile 1' },
  turnstile2: { device: 'Lobby Camera', area: `${LOBBY}/Turnstile Gallery`, accessPoint: 'Turnstile 2' },
  turnstile3: { device: 'Lobby Camera', area: `${LOBBY}/Turnstile Gallery`, accessPoint: 'Turnstile 3' },
  turnstile4: { device: 'Lobby Camera', area: `${LOBBY}/Turnstile Gallery`, accessPoint: 'Turnstile 4' },
  reception: { device: 'Lobby Camera', area: `${LOBBY}/Reception`, accessPoint: 'Reception Desk' },
  // No access point: the derivation assigns the camera's own binding, as for a live lobby detection.
  lounge: { device: 'Lobby Camera', area: `${LOBBY}/Lobby Lounge`, accessPoint: null },
  serverRoom: { device: 'Server Room Camera', area: `Nova Tower/${floorName(3)}/Server Room`, accessPoint: 'Server Room Door' },
  dock: { device: 'Loading Dock Camera', area: `${LOBBY}/Loading Dock`, accessPoint: 'Loading Dock Door' },
  parking: { device: 'Parking Gate Terminal', area: 'Nova Tower/Parking/Parking Level P-1', accessPoint: 'Parking Gate' },
  executive: { device: 'Executive Floor Reader', area: `Nova Tower/${floorName(24)}/Executive Reception`, accessPoint: 'Executive Floor Door' },
};

function need<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`seed: history needs ${what}`);
  return value;
}

export async function resolveNovaPoints(
  ctx: SeedContext,
  facility: string,
  facilities: SeedFacilitiesResult,
  devices: SeedDevicesResult,
): Promise<Record<PointKey, ResolvedPoint>> {
  const { access_points: aps } = await ctx.admin.request<{ access_points: { id: string; name: string }[] }>(ACCESS_POINTS, { facility });
  const apIds = new Map(aps.map((a) => [a.name, a.id]));
  const out = {} as Record<PointKey, ResolvedPoint>;
  for (const [key, spec] of Object.entries(POINT_SPECS) as [PointKey, (typeof POINT_SPECS)[PointKey]][]) {
    out[key] = {
      device_id: need(devices[`nova/${spec.device}`]?.id, `device ${spec.device}`),
      area_id: need(facilities.areas[`nova/${spec.area}`], `area ${spec.area}`),
      access_point_id: spec.accessPoint ? need(apIds.get(spec.accessPoint), `access point ${spec.accessPoint}`) : null,
    };
  }
  return out;
}

function visitRow(org: string, facility: string, now: number, v: PlannedVisit): Record<string, unknown> {
  const iso = (ms: number | undefined) => (ms === undefined ? null : new Date(ms).toISOString());
  return {
    organization_id: org,
    facility_id: facility,
    visitor_profile_id: v.visitorProfileId,
    host_profile_id: v.hostProfileId,
    company_id: v.companyId,
    purpose: v.purpose,
    expected_start: iso(v.expectedStart),
    expected_end: iso(v.expectedEnd),
    status: v.status,
    checked_in_at: iso(v.checkedInAt),
    checked_out_at: iso(v.checkedOutAt),
    badge_number: v.badgeNumber ?? null,
    cancellation_reason: v.cancellationReason ?? null,
    // Registered by the host a day or two ahead.
    created_at: iso(Math.min(now, v.expectedStart - 36 * 3_600_000)),
  };
}

export async function replayHistory(
  ctx: SeedContext,
  args: {
    org: string;
    facility: string;
    plan: HistoryPlan;
    points: Record<PointKey, ResolvedPoint>;
    /** Marker age (default 29 days: the Nova replay covers 30). */
    markerAgeMs?: number;
    label?: string;
  },
): Promise<ReplayResult> {
  const started = Date.now();
  const { org, facility, plan } = args;
  type Ids = { id: string }[];
  const marker = await ctx.admin.request<{ marker: Ids; newer: Ids; sessions: Ids; visits: Ids }>(MARKER, {
    org,
    before: new Date(ctx.now.getTime() - (args.markerAgeMs ?? MARKER_AGE_MS)).toISOString(),
    start: new Date(plan.days[0]?.start ?? ctx.now.getTime()).toISOString(),
  });
  const decision = replayDecision({
    seeded: marker.marker.length > 0,
    newerData: marker.newer.length > 0 || marker.sessions.length > 0,
  });
  if (decision !== 'replay') return { skipped: decision, days: 0, detections: 0, visits: 0, durationMs: Date.now() - started };

  const { points } = args;
  let visits = 0;
  if (marker.visits.length === 0 && plan.visits.length > 0) {
    await ctx.admin.request(INSERT_VISITS, { objects: plan.visits.map((v) => visitRow(org, facility, ctx.now.getTime(), v)) });
    visits = plan.visits.length;
  }
  let detections = 0;
  for (const day of plan.days) {
    const inDay = plan.detections.filter((d) => d.at >= day.start && d.at < day.end);
    const mutation = buildDayMutation({ organization: org, day, detections: inDay, resolve: (p) => points[p], newId: randomUUID });
    await ctx.admin.request(mutation.query, mutation.variables);
    detections += mutation.detections;
    process.stdout.write(`  ${args.label ?? 'history'} ${day.date}: ${mutation.detections} detections\n`);
  }
  return { skipped: false, days: plan.days.length, detections, visits, durationMs: Date.now() - started };
}
