import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { seedHistoryConfig } from './historyConfig.js';
import { seedIncidentHistory } from './historyIncidents.js';
import { seedOperatorHistory } from './historyOperators.js';
import { historyPeople } from './historyPeople.js';
import { buildHistoryPlan } from './historyPlan.js';
import { replayHistory, type ReplayResult } from './historyReplay.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Nova Tower history (design §9, slice 4): configuration (threshold, watch lists, event rules), the tracked people's
 * identities, 30 days of detections replayed through the pipeline with visits, then the operator side (incident
 * lifecycle, shift handovers, workspaces, estimated locations). Riverside has no camera stream and no history.
 */
export type SeedHistoryResult = {
  replay: ReplayResult;
  rulesCreated: number;
  incidents: { incidents: number; processed: number; byStatus: Record<string, number> };
  operators: { handovers: number; workspaces: number; estimatedLocations: number };
};

export async function seedHistory(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  devices: SeedDevicesResult,
  people: SeedPeopleResult,
): Promise<SeedHistoryResult> {
  const org = tenancy.orgs.nova;
  const facility = facilities.facilities.nova;
  const timezone = SEED_FACILITIES.nova.timezone;
  const area = (path: string): string => {
    const id = facilities.areas[`nova/Nova Tower/${path}`];
    if (!id) throw new Error(`seed: area ${path} missing`);
    return id;
  };

  const tracked = await historyPeople(ctx, org, people);
  const { rulesCreated } = await seedHistoryConfig(ctx, {
    org,
    adminUser: tenancy.users.admin,
    facility,
    areas: { loadingDock: area('Lobby/Loading Dock'), lobbyLounge: area('Lobby/Lobby Lounge') },
    blacklistedProfile: people.byRole.blacklisted[0] ?? null,
    vipProfiles: people.byRole.vip,
    watchedIdentity: tracked.watchedIdentity,
  });

  const plan = buildHistoryPlan({ ...tracked, now: ctx.now, timezone });
  const replay = await replayHistory(ctx, { org, facility, facilities, devices, plan });
  const users = { admin: tenancy.users.admin, novaAdmin: tenancy.users.novaAdmin };
  const incidents = await seedIncidentHistory(ctx, { org, users: [users.admin, users.novaAdmin] });
  const operators = await seedOperatorHistory(ctx, {
    org,
    users,
    timezone,
    devices,
    facilities,
    companyByIdentity: tracked.companyByIdentity,
  });
  return { replay, rulesCreated, incidents, operators };
}
