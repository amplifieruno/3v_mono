import { seedAccessHistory, type SeedAccessHistoryResult } from './accessHistory.js';
import type { SeedDevicesResult } from './devices.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { floorName, SEED_FACILITIES } from './facilityPlan.js';
import { BLACKLIST_RULE, seedHistoryConfig } from './historyConfig.js';
import { seedIncidentHistory } from './historyIncidents.js';
import { attachEscalationPolicy, attachRulePolicies, ruleId, signHistoryWebhooks } from './historyNotifications.js';
import { seedOperatorHistory } from './historyOperators.js';
import { historyPeople } from './historyPeople.js';
import { buildHistoryPlan } from './historyPlan.js';
import { replayHistory, resolveNovaPoints, type ReplayResult } from './historyReplay.js';
import { configurationTime } from './historyTime.js';
import { seedRiversideHistory, type RiversideHistoryResult } from './historyRiverside.js';
import type { SeedIdentitiesResult } from './faces.js';
import { seedSubscriptions, type SeedNotificationsResult } from './notifications.js';
import type { SeedPeopleResult } from './people.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Nova Tower history (design §9, slice 4): configuration (threshold, watch lists, event rules), the tracked people's
 * identities, 30 days of detections replayed through the pipeline with visits, then the operator side (incident
 * lifecycle, shift handovers, workspaces, estimated locations); then a week of light Riverside history.
 * Notifications (slice 5): the personal subscriptions are written before the replay, so Stage C produces the history's
 * deliveries, inbox rows and webhook deliveries; incidents of the blacklist rule escalate at simulated times; afterwards
 * the blacklist event rule and the escalating notification rule (Blacklist matches) get the escalation policy for
 * live incidents and the replayed webhook deliveries are signed.
 * Physical access (slice 8): the policies exist before this step (access.ts); the visitors' grants and the fire drill
 * are written once the replay is decided (accessHistory.ts), so the turnstiles' face decisions of the history come
 * from the real engine.
 */
export type SeedHistoryResult = {
  replay: ReplayResult;
  rulesCreated: number;
  incidents: { incidents: number; processed: number; byStatus: Record<string, number>; escalations: number; demoIncident: string | null };
  notifications: { subscriptionsCreated: number; webhooksSigned: number };
  operators: { handovers: number; workspaces: number; estimatedLocations: number };
  riverside: RiversideHistoryResult;
  access: SeedAccessHistoryResult;
};

export async function seedHistory(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
  devices: SeedDevicesResult,
  people: SeedPeopleResult,
  identities: SeedIdentitiesResult,
  notifications: SeedNotificationsResult,
): Promise<SeedHistoryResult> {
  const org = tenancy.orgs.nova;
  const facility = facilities.facilities.nova;
  const timezone = SEED_FACILITIES.nova.timezone;
  const area = (path: string): string => {
    const id = facilities.areas[`nova/Nova Tower/${path}`];
    if (!id) throw new Error(`seed: area ${path} missing`);
    return id;
  };

  const tracked = await historyPeople(ctx, org, people, identities);
  const { rulesCreated } = await seedHistoryConfig(ctx, {
    org,
    adminUser: tenancy.users.admin,
    facility,
    configuredAt: configurationTime(ctx.now, timezone),
    areas: { lobbyLounge: area('Lobby/Lobby Lounge'), secureFloors: [area(floorName(3)), area(floorName(24))] },
    blacklistedProfile: people.byRole.blacklisted[0] ?? null,
    vipProfiles: people.byRole.vip,
    watchedIdentity: tracked.watchedIdentity,
  });

  const users = { admin: tenancy.users.admin, novaAdmin: tenancy.users.novaAdmin };
  const subscriptionsCreated = await seedSubscriptions(ctx, {
    org,
    users,
    facility,
    watchedIdentity: tracked.watchedIdentity,
    configuredAt: configurationTime(ctx.now, timezone),
  });

  const plan = buildHistoryPlan({ ...tracked, now: ctx.now, timezone });
  const points = await resolveNovaPoints(ctx, facility, facilities, devices);
  let access: SeedAccessHistoryResult = { grants: 0, drill: false };
  const replay = await replayHistory(ctx, {
    org,
    facility,
    plan,
    points,
    // Slice 8: the visitors' grants and the fire drill exist before the first simulated day decides anything.
    beforeDays: async () => {
      access = await seedAccessHistory(ctx, {
        org, facility, timezone, visits: plan.visits, users: { admin: users.admin, operator: tenancy.users.operator },
        area: (path) => {
          const id = facilities.areas[`nova/${path}`];
          if (!id) throw new Error(`seed: area ${path} missing`);
          return id;
        },
      });
    },
  });
  const blacklistRule = await ruleId(ctx, org, BLACKLIST_RULE);
  const incidents = await seedIncidentHistory(ctx, {
    org,
    users: [users.admin, users.novaAdmin],
    falsePositiveIdentity: tracked.blacklistedIdentity,
    escalation: blacklistRule ? { ruleId: blacklistRule, policyId: notifications.policyId } : null,
  });
  await attachEscalationPolicy(ctx, { org, adminUser: users.admin, ruleName: BLACKLIST_RULE, policyId: notifications.policyId });
  await attachRulePolicies(ctx, { org, adminUser: users.admin, policyId: notifications.policyId });
  const webhooksSigned = await signHistoryWebhooks(ctx, org);
  const operators = await seedOperatorHistory(ctx, {
    org,
    users,
    timezone,
    devices,
    facilities,
    companyByIdentity: tracked.companyByIdentity,
  });
  const riverside = await seedRiversideHistory(ctx, tenancy, facilities, devices);
  return { replay, rulesCreated, incidents, operators, riverside, access, notifications: { subscriptionsCreated, webhooksSigned } };
}
