import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { seedRules } from './historyConfig.js';
import type { ResolvedPoint } from './historyMutation.js';
import { replayHistory, type ReplayResult } from './historyReplay.js';
import { POINTS, Track, type PointKey } from './historyScripts.js';
import { replayDays, weekday } from './historyTime.js';
import { seededRandom } from './random.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * A light week of Riverside Office Park history, so switching organizations shows separate data: the employees with
 * a granted biometric consent (import identities, like Nova Tower) pass the front door camera on weekdays, and one
 * of them comes back late one evening (after_hours; the "After-hours entry" rule opens an incident). Replayed through
 * the same pipeline and with the same idempotency rules as Nova Tower.
 */
export type RiversideHistoryResult = ReplayResult & { rulesCreated: number };

type ProfileRow = { id: string; consent_records: { status: string }[]; identities: { id: string }[] };

const PROFILES = `
  query SeedRiversideProfiles($org: uuid!) {
    profiles(where: { organization_id: { _eq: $org }, profile_type: { _eq: employee } }, order_by: { external_id: asc }) {
      id
      consent_records(where: { purpose: { _eq: biometric_processing } }, order_by: { granted_at: desc }, limit: 1) { status }
      identities(where: { status: { _nin: [merged, archived] } }, order_by: { number: asc }) { id }
    }
  }
`;
const ACCESS_POINT = `
  query SeedRiversideDoor($facility: uuid!) {
    access_points(where: { facility_id: { _eq: $facility }, name: { _eq: "Front Door" } }) { id }
  }
`;
const INSERT_IDENTITIES = `
  mutation SeedRiversideIdentities($objects: [identities_insert_input!]!) { insert_identities(objects: $objects) { affected_rows } }
`;

const DAY_MS = 86_400_000;

async function trackedIdentities(ctx: SeedContext, org: string): Promise<string[]> {
  const load = async () => (await ctx.admin.request<{ profiles: ProfileRow[] }>(PROFILES, { org })).profiles;
  const consented = (p: ProfileRow) => p.consent_records[0]?.status === 'granted';
  let profiles = await load();
  const missing = profiles.filter((p) => consented(p) && p.identities.length === 0);
  if (missing.length > 0) {
    await ctx.admin.request(INSERT_IDENTITIES, {
      objects: missing.map((p) => ({
        organization_id: org,
        profile_id: p.id,
        is_primary_for_profile: true,
        source: 'import',
        attributes: { origin: 'access_control_import' },
      })),
    });
    profiles = await load();
  }
  return profiles.filter(consented).flatMap((p) => (p.identities[0] ? [p.identities[0].id] : []));
}

export async function seedRiversideHistory(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  devices: SeedDevicesResult,
): Promise<RiversideHistoryResult> {
  const org = tenancy.orgs.riverside;
  const facility = facilities.facilities.riverside;
  const { timezone } = SEED_FACILITIES.riverside;
  // The last week, starting on a weekday (the first day always has detections: the history marker).
  const days = replayDays(ctx.now, timezone).slice(-7);
  while (days.length > 1 && weekday(days[0].date) > 5) days.shift();
  const first = days[0]?.start ?? ctx.now.getTime();

  const rulesCreated = await seedRules(ctx, { org, adminUser: tenancy.users.riversideAdmin, configuredAt: first - 2 * DAY_MS }, [
    {
      name: 'After-hours entry',
      description: 'Anyone entering outside the office hours',
      rule_type: 'after_hours',
      severity: 'medium',
      creates_incident: true,
      parameters: {},
      scopes: [{ facility_id: facility }],
      publish: true,
    },
  ]);

  const people = await trackedIdentities(ctx, org);
  const t = new Track(seededRandom('riverside-office-park:history'), timezone);
  const weekdays = days.filter((d) => weekday(d.date) <= 5);
  for (const [i, day] of weekdays.entries()) {
    people.forEach((id, n) => {
      if (n > 0 && !t.rnd.chance(0.75)) return;
      t.pass(id, 'entrance', t.at(day.date, t.rnd.int(510, 570)));
      t.pass(id, 'entrance', t.at(day.date, t.rnd.int(1050, 1110)));
    });
    // The second-to-last weekday: someone comes back for a laptop at 21:40.
    if (i === weekdays.length - 2 && people[0]) t.pass(people[0], 'entrance', t.at(day.date, 21 * 60 + 40), 2);
  }
  const end = days[days.length - 1]?.end ?? 0;
  const detections = t.out.filter((d) => d.at >= first && d.at < end).sort((a, b) => a.at - b.at || (a.identityId < b.identityId ? -1 : 1));

  const camera = devices['riverside/Front Door Camera']?.id;
  const area = facilities.areas['riverside/Building A/Ground Floor/Reception'];
  const { access_points: aps } = await ctx.admin.request<{ access_points: { id: string }[] }>(ACCESS_POINT, { facility });
  if (!camera || !area || !aps[0]) throw new Error('seed: Riverside front door camera, reception or door missing');
  const door: ResolvedPoint = { device_id: camera, area_id: area, access_point_id: aps[0].id };
  const points = Object.fromEntries(POINTS.map((p) => [p, door])) as Record<PointKey, ResolvedPoint>;
  const replay = await replayHistory(ctx, {
    org,
    facility,
    plan: { days, detections, visits: [] },
    points,
    markerAgeMs: ctx.now.getTime() - (first + DAY_MS),
    label: 'riverside',
  });
  return { ...replay, rulesCreated };
}
