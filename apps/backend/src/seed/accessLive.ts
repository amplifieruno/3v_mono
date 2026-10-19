import { randomUUID } from 'node:crypto';
import { createHasuraClient } from '../hasura/client.js';
import { policyRefs, syncSeedTerminals } from './access.js';
import { livePolicies, maintenanceGrant, riversidePolicies } from './accessPlan.js';
import { ensurePolicies } from './accessPolicies.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime, localDate } from './historyTime.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Physical access, after the segments step (slice 8): the Nova policies that decide nothing in the history (the
 * executive floor policy on the slice-6 "Executive floor access" segment, published; the parking gate policy
 * submitted by the second Nova admin and awaiting the first one's approval; the loading dock draft), Riverside's one
 * published policy, a contractor's grant revoked through revoke_access_grant (an urgent policy epoch), then the
 * terminals of both organizations synced to the current epoch through the real sync path (the offline turnstile
 * terminal is recorded unreachable and stays stale). Idempotent: keyed by name and reason; a re-run only syncs the
 * terminals that are due.
 */
export type SeedAccessResult = {
  policiesCreated: number;
  grantRevoked: boolean;
  terminals: { synced: number; unreachable: number };
};

const REVOKED_REASON = 'Furniture installation on the executive floor';

const GRANT = `
  query SeedRevokedGrant($org: uuid!, $reason: String!) {
    access_grants(where: { organization_id: { _eq: $org }, reason: { _eq: $reason } }) { id }
    contractor: profiles(where: { organization_id: { _eq: $org }, profile_type: { _eq: contractor }, status: { _eq: active },
                                  external_id: { _like: "seed:%" } }, order_by: { external_id: asc }, limit: 1) { id }
    access_points(where: { organization_id: { _eq: $org }, name: { _eq: "Executive Floor Door" } }) { id }
  }
`;
const GRANT_AND_REVOKE = `
  mutation SeedRevokedGrant($grant: access_grants_insert_input!, $id: uuid!) {
    insert_access_grants_one(object: $grant) { id }
    revoke_access_grant(args: { p_grant: $id, p_reason: "Installation postponed by the vendor" }) { id }
  }
`;

async function revokedGrant(ctx: SeedContext, org: string, admin: string): Promise<boolean> {
  const data = await ctx.admin.request<{ access_grants: { id: string }[]; contractor: { id: string }[]; access_points: { id: string }[] }>(
    GRANT,
    { org, reason: REVOKED_REASON },
  );
  const contractor = data.contractor[0];
  const door = data.access_points[0];
  if (data.access_grants.length > 0 || !contractor || !door) return false;
  const timezone = SEED_FACILITIES.nova.timezone;
  const slot = maintenanceGrant(localDate(ctx.now.getTime(), timezone), timezone);
  const id = randomUUID();
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: admin, organizationId: org });
  await actor.request(GRANT_AND_REVOKE, {
    id,
    grant: {
      id,
      organization_id: org,
      profile_id: contractor.id,
      access_point_id: door.id,
      valid_from: new Date(slot.validFrom).toISOString(),
      valid_until: new Date(slot.validUntil).toISOString(),
      reason: REVOKED_REASON,
    },
  });
  return true;
}

export async function seedAccess(ctx: SeedContext, tenancy: SeedTenancyResult, facilities: SeedFacilitiesResult): Promise<SeedAccessResult> {
  const { users, orgs } = tenancy;
  const validFrom = configurationTime(ctx.now, SEED_FACILITIES.nova.timezone);
  const novaRefs = await policyRefs(ctx, { org: orgs.nova, orgKey: 'nova', facility: facilities.facilities.nova, facilities });
  let policiesCreated = await ensurePolicies(ctx, {
    org: orgs.nova,
    specs: livePolicies(),
    refs: novaRefs,
    actors: { author: users.admin, approver: users.novaAdmin, pendingAuthor: users.novaAdmin },
    validFrom,
  });
  const riversideRefs = await policyRefs(ctx, {
    org: orgs.riverside,
    orgKey: 'riverside',
    facility: facilities.facilities.riverside,
    facilities,
  });
  policiesCreated += await ensurePolicies(ctx, {
    org: orgs.riverside,
    specs: riversidePolicies(),
    refs: riversideRefs,
    actors: { author: users.riversideAdmin, approver: users.admin, pendingAuthor: users.riversideAdmin },
    validFrom,
  });
  const grantRevoked = await revokedGrant(ctx, orgs.nova, users.admin);

  const nova = await syncSeedTerminals(ctx, orgs.nova);
  const riverside = await syncSeedTerminals(ctx, orgs.riverside);
  return {
    policiesCreated,
    grantRevoked,
    terminals: { synced: nova.synced + riverside.synced, unreachable: nova.unreachable + riverside.unreachable },
  };
}
