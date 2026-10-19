import { createHasuraClient } from '../hasura/client.js';
import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { localDate, zonedTime } from './historyTime.js';
import type { SeedContext } from './tenancy.js';

/**
 * Operator data around the history: shift handovers between the two Nova Tower admins over the last three evenings
 * (with the incidents still open; the older two acknowledged by their recipient), a monitoring workspace per admin,
 * and estimated locations (no live producer: inserted directly) placing a few employees on their tenant floor after
 * the turnstile. Each part is skipped when its rows exist.
 */
const DAY_MS = 86_400_000;

const HANDOVERS = `
  query SeedHandoverState($org: uuid!) {
    shift_handovers(where: { organization_id: { _eq: $org } }, limit: 1) { id }
    incidents(where: { organization_id: { _eq: $org }, status: { _neq: closed } }, order_by: { created_at: asc }) { id created_at }
  }
`;
const INSERT_HANDOVER = `
  mutation SeedHandover($h: shift_handovers_insert_input!) { insert_shift_handovers_one(object: $h) { id } }
`;
const ACK_HANDOVER = `mutation SeedAckHandover($id: uuid!) { acknowledge_shift_handover(args: { p_handover: $id }) { id } }`;
const BACKDATE_HANDOVER = `
  mutation SeedBackdateHandover($id: uuid!, $set: shift_handovers_set_input!) {
    update_shift_handovers_by_pk(pk_columns: { id: $id }, _set: $set) { id }
  }
`;
const UPSERT_WORKSPACES = `
  mutation SeedWorkspaces($objects: [operator_workspaces_insert_input!]!) {
    insert_operator_workspaces(
      objects: $objects
      on_conflict: { constraint: operator_workspaces_organization_id_user_id_name_key, update_columns: [] }
    ) { affected_rows }
  }
`;
const ESTIMATE_STATE = `
  query SeedEstimateState($org: uuid!, $area: uuid!, $since: timestamptz!) {
    identity_locations(where: { organization_id: { _eq: $org }, is_estimated: { _eq: true } }, limit: 1) { id }
    tracking_sessions(
      where: { organization_id: { _eq: $org }, last_area_id: { _eq: $area }, status: { _eq: lost }, started_at: { _gt: $since } }
      order_by: { started_at: desc }
      limit: 200
    ) { id identity_id facility_id last_detected_at }
  }
`;
const INSERT_LOCATIONS = `
  mutation SeedEstimated($objects: [identity_locations_insert_input!]!) { insert_identity_locations(objects: $objects) { affected_rows } }
`;

type Users = { admin: string; novaAdmin: string };

async function seedHandovers(ctx: SeedContext, org: string, users: Users, timezone: string): Promise<number> {
  const state = await ctx.admin.request<{ shift_handovers: { id: string }[]; incidents: { id: string; created_at: string }[] }>(
    HANDOVERS,
    { org },
  );
  if (state.shift_handovers.length > 0) return 0;
  const client = (user: string) => createHasuraClient(ctx.env, { role: 'admin', userId: user, organizationId: org });
  const shifts = [
    { daysAgo: 3, from: users.admin, to: users.novaAdmin, ack: true },
    { daysAgo: 2, from: users.novaAdmin, to: users.admin, ack: true },
    { daysAgo: 1, from: users.admin, to: users.novaAdmin, ack: false },
  ];
  for (const shift of shifts) {
    const date = localDate(ctx.now.getTime() - shift.daysAgo * DAY_MS, timezone);
    const started = zonedTime(date, 8 * 60, timezone);
    const ended = Math.min(zonedTime(date, 20 * 60, timezone), ctx.now.getTime() - 60_000);
    const open = state.incidents.filter((i) => Date.parse(i.created_at) < ended).slice(-3);
    const { insert_shift_handovers_one: row } = await client(shift.from).request<{ insert_shift_handovers_one: { id: string } }>(
      INSERT_HANDOVER,
      {
        h: {
          organization_id: org,
          to_user_id: shift.to,
          shift_started_at: new Date(started).toISOString(),
          shift_ended_at: new Date(ended).toISOString(),
          summary:
            open.length > 0
              ? `Day shift handover: ${open.length} incident(s) still open, see the linked list. Cameras online.`
              : 'Day shift handover: quiet shift, no open incidents. Cameras online.',
          shift_handover_incidents: { data: open.map((i) => ({ incident_id: i.id })) },
        },
      },
    );
    const set: Record<string, string> = { created_at: new Date(ended).toISOString() };
    if (shift.ack) {
      await client(shift.to).request(ACK_HANDOVER, { id: row.id });
      set.acknowledged_at = new Date(Math.min(ended + 7 * 60_000, ctx.now.getTime())).toISOString();
    }
    await ctx.admin.request(BACKDATE_HANDOVER, { id: row.id, set });
  }
  return shifts.length;
}

async function seedWorkspaces(ctx: SeedContext, org: string, users: Users, devices: SeedDevicesResult): Promise<number> {
  const cameras = ['Main Entrance Camera', 'Lobby Camera', 'Server Room Camera', 'Loading Dock Camera'].flatMap((name) => {
    const id = devices[`nova/${name}`]?.id;
    return id ? [{ type: 'camera', device_id: id, title: name }] : [];
  });
  const layouts = [
    { name: 'Lobby monitoring', is_default: true, layout: { columns: 2, panels: [...cameras, { type: 'event_feed', severities: ['medium', 'high', 'critical'] }] } },
    { name: 'Incident desk', is_default: false, layout: { columns: 3, panels: [{ type: 'incident_queue', statuses: ['open', 'acknowledged', 'investigating'] }, { type: 'occupancy', facility: 'Nova Tower' }, ...cameras.slice(0, 1)] } },
  ];
  const objects = [users.admin, users.novaAdmin].flatMap((user_id) => layouts.map((l) => ({ ...l, organization_id: org, user_id })));
  const data = await ctx.admin.request<{ insert_operator_workspaces: { affected_rows: number } }>(UPSERT_WORKSPACES, { objects });
  return data.insert_operator_workspaces.affected_rows;
}

async function seedEstimatedLocations(
  ctx: SeedContext,
  org: string,
  facilities: SeedFacilitiesResult,
  companyByIdentity: Record<string, string>,
): Promise<number> {
  const gallery = facilities.areas['nova/Nova Tower/Lobby/Turnstile Gallery'];
  if (!gallery) return 0;
  type Session = { id: string; identity_id: string; facility_id: string; last_detected_at: string };
  const state = await ctx.admin.request<{ identity_locations: { id: string }[]; tracking_sessions: Session[] }>(ESTIMATE_STATE, {
    org,
    area: gallery,
    since: new Date(ctx.now.getTime() - 7 * DAY_MS).toISOString(),
  });
  if (state.identity_locations.length > 0) return 0;
  const suite = (company: string): string | undefined =>
    Object.entries(facilities.areas).find(([key]) => key.startsWith('nova/') && key.endsWith(`(${company})`))?.[1];
  const objects = state.tracking_sessions
    .flatMap((s) => {
      const area = suite(companyByIdentity[s.identity_id] ?? '');
      if (!area) return [];
      return [{
        organization_id: org,
        identity_id: s.identity_id,
        session_id: s.id,
        facility_id: s.facility_id,
        area_id: area,
        movement_type: 'movement',
        is_estimated: true,
        uncertainty_m: 25,
        confidence: 0.6,
        occurred_at: new Date(Date.parse(s.last_detected_at) + 90_000).toISOString(),
      }];
    })
    .slice(0, 15);
  if (objects.length === 0) return 0;
  const data = await ctx.admin.request<{ insert_identity_locations: { affected_rows: number } }>(INSERT_LOCATIONS, { objects });
  return data.insert_identity_locations.affected_rows;
}

export async function seedOperatorHistory(
  ctx: SeedContext,
  args: { org: string; users: Users; timezone: string; devices: SeedDevicesResult; facilities: SeedFacilitiesResult; companyByIdentity: Record<string, string> },
): Promise<{ handovers: number; workspaces: number; estimatedLocations: number }> {
  return {
    handovers: await seedHandovers(ctx, args.org, args.users, args.timezone),
    workspaces: await seedWorkspaces(ctx, args.org, args.users, args.devices),
    estimatedLocations: await seedEstimatedLocations(ctx, args.org, args.facilities, args.companyByIdentity),
  };
}
