import { randomUUID } from 'node:crypto';
import { syncTerminals } from '../access/terminalSync.js';
import { createHasuraClient } from '../hasura/client.js';
import { FACE_CREDENTIAL_DOORS, historyPolicies, IT_SEGMENT, OFFLINE_TERMINAL } from './accessPlan.js';
import { ensurePolicies, type PolicyRefs } from './accessPolicies.js';
import { SCHEDULES } from './companies.js';
import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime } from './historyTime.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Physical access configuration the Nova Tower history is decided by (slice 8, design §6.13, §9), written before the
 * replay: face credential on the turnstiles and the server room door, the "IT and server room staff" segment (manual,
 * back-dated to the configuration time), the published history policies (valid from the configuration time,
 * accessPlan) and the offline turnstile terminal (record_device_health, so it is never synced: stale and out of the
 * convergence bound). The visitor grants and the fire drill depend on the replayed plan (accessHistory.ts); the
 * live-only policies, Riverside and the terminal sync run after the segments step (accessLive.ts).
 * Idempotent: rows keyed by name; nothing is written on a re-run.
 */
export type SeedAccessConfigResult = { policiesCreated: number; segmentCreated: boolean; faceDoors: number; terminalOffline: boolean };

const ACCESS_POINTS = `
  query SeedAccessPoints($facility: uuid!) { access_points(where: { facility_id: { _eq: $facility } }) { id name } }
`;
const REFS = `
  query SeedAccessRefs($org: uuid!, $night: String!) {
    segments(where: { organization_id: { _eq: $org } }) { id name }
    operations: profiles(
      where: { organization_id: { _eq: $org }, external_id: { _like: "seed:%" },
               _or: [{ department: { _eq: "Security" } }, { work_schedule: { name: { _eq: $night } } }] }
      order_by: { external_id: asc }
    ) { id }
  }
`;
const IT_PEOPLE = `
  query SeedItPeople($org: uuid!) {
    chief: profiles(where: { organization_id: { _eq: $org }, department: { _eq: "Security" }, access_level: { _eq: elevated } },
                    order_by: { external_id: asc }, limit: 1) { id }
    engineers: profiles(where: { organization_id: { _eq: $org }, profile_type: { _eq: employee }, department: { _eq: "Engineering" },
                                 access_level: { _eq: standard } }, order_by: { external_id: asc }, limit: 2) { id }
  }
`;
const INSERT_SEGMENT = `
  mutation SeedItSegment($segment: segments_insert_input!, $members: [segment_members_insert_input!]!) {
    insert_segments_one(object: $segment) { id }
    insert_segment_members(objects: $members) { affected_rows }
  }
`;
const FACE_DOORS = `
  mutation SeedFaceDoors($facility: uuid!, $names: [String!]!) {
    update_access_points(where: { facility_id: { _eq: $facility }, name: { _in: $names }, face_credential: { _eq: false } },
                         _set: { face_credential: true }) { affected_rows }
  }
`;
const TERMINAL = `query SeedOfflineTerminal($id: uuid!) { devices_by_pk(id: $id) { health_status } }`;
const OFFLINE = `
  mutation SeedTerminalOffline($id: uuid!, $at: timestamptz!) {
    record_device_health(args: { p_device: $id, p_reachable: false, p_latency_ms: null, p_frame_ok: false, p_checked_at: $at }) { id }
  }
`;

const HOUR_MS = 3_600_000;

/** Ids the policy specs reference, for one organization and facility. */
export async function policyRefs(
  ctx: SeedContext,
  args: { org: string; orgKey: 'nova' | 'riverside'; facility: string; facilities: SeedFacilitiesResult },
): Promise<PolicyRefs> {
  const { access_points: aps } = await ctx.admin.request<{ access_points: { id: string; name: string }[] }>(ACCESS_POINTS, {
    facility: args.facility,
  });
  const data = await ctx.admin.request<{ segments: { id: string; name: string }[]; operations: { id: string }[] }>(REFS, {
    org: args.org,
    night: SCHEDULES.nightShift,
  });
  return {
    accessPoints: new Map(aps.map((a) => [a.name, a.id])),
    areas: (path) => {
      const id = args.facilities.areas[`${args.orgKey}/${path}`];
      if (!id) throw new Error(`seed: area ${path} missing`);
      return id;
    },
    facility: args.facility,
    segments: new Map(data.segments.map((s) => [s.name, s.id])),
    groups: { operations: data.operations.map((p) => p.id) },
  };
}

/** The manual server room segment: the security chief and two engineers, an hour after the configuration time. */
async function seedItSegment(ctx: SeedContext, org: string, admin: string, configuredAt: number): Promise<boolean> {
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: admin, organizationId: org });
  const { segments } = await ctx.admin.request<{ segments: { id: string; name: string }[] }>(REFS, { org, night: SCHEDULES.nightShift });
  if (segments.some((s) => s.name === IT_SEGMENT.name)) return false;
  const people = await ctx.admin.request<{ chief: { id: string }[]; engineers: { id: string }[] }>(IT_PEOPLE, { org });
  const id = randomUUID();
  const created = new Date(configuredAt).toISOString();
  const added = new Date(configuredAt + HOUR_MS).toISOString();
  await actor.request(INSERT_SEGMENT, {
    segment: { id, organization_id: org, ...IT_SEGMENT, kind: 'manual', target: 'profiles', conditions: {}, status: 'active', created_at: created },
    members: [...people.chief, ...people.engineers].map((p) => ({
      organization_id: org, segment_id: id, target: 'profiles', profile_id: p.id, source: 'manual',
      added_by: admin, added_at: added, created_at: added,
    })),
  });
  return true;
}

export async function seedAccessConfig(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  devices: SeedDevicesResult,
): Promise<SeedAccessConfigResult> {
  const org = tenancy.orgs.nova;
  const facility = facilities.facilities.nova;
  const configuredAt = configurationTime(ctx.now, SEED_FACILITIES.nova.timezone);
  const admin = createHasuraClient(ctx.env, { role: 'admin', userId: tenancy.users.admin, organizationId: org });

  // First, so it never receives a policy epoch: unreachable since the seed started (no live probe reaches a terminal).
  const terminal = devices[`nova/${OFFLINE_TERMINAL}`];
  if (!terminal) throw new Error(`seed: device ${OFFLINE_TERMINAL} missing`);
  const { devices_by_pk: state } = await ctx.admin.request<{ devices_by_pk: { health_status: string } | null }>(TERMINAL, { id: terminal.id });
  const terminalOffline = state?.health_status !== 'critical';
  // Wall-clock now: after the device row and its seeded health history (both written since the seed started).
  if (terminalOffline) await ctx.admin.request(OFFLINE, { id: terminal.id, at: new Date().toISOString() });

  const doors = await admin.request<{ update_access_points: { affected_rows: number } }>(FACE_DOORS, { facility, names: FACE_CREDENTIAL_DOORS });
  const segmentCreated = await seedItSegment(ctx, org, tenancy.users.admin, configuredAt);
  const refs = await policyRefs(ctx, { org, orgKey: 'nova', facility, facilities });
  const policiesCreated = await ensurePolicies(ctx, {
    org,
    specs: historyPolicies(),
    refs,
    actors: { author: tenancy.users.admin, approver: tenancy.users.novaAdmin, pendingAuthor: tenancy.users.novaAdmin },
    validFrom: configuredAt,
  });

  return { policiesCreated, segmentCreated, faceDoors: doors.update_access_points.affected_rows, terminalOffline };
}

/** Pushes the current policy epoch to the organization's due terminals through the real sync path (stub transport). */
export async function syncSeedTerminals(ctx: SeedContext, organizationId: string): Promise<{ synced: number; unreachable: number }> {
  const reports = await syncTerminals(ctx.admin, { at: new Date(), organizationId });
  return {
    synced: reports.filter((r) => r.result === 'synced').length,
    unreachable: reports.filter((r) => r.result === 'unreachable').length,
  };
}
