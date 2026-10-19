import { createHasuraClient } from '../hasura/client.js';
import { VISITOR_GRANT_AREA, visitGrants } from './accessPlan.js';
import { fireDrill } from './historyAccess.js';
import { localDate } from './historyTime.js';
import type { PlannedVisit } from './historyVisits.js';
import type { SeedContext } from './tenancy.js';

/**
 * The plan-dependent part of the physical access history (slice 8), written by the replay right after the visits and
 * before the first simulated day (historyReplay's beforeDays): the visitors' day grants (accessPlan.visitGrants:
 * Elevator Hall, i.e. all four turnstiles; one single-use, consumed on the way in during the replay) and the fire drill
 * (historyAccess.fireDrill: a facility-wide evacuation started and ended by the security operator through
 * itap.seed_emergency_override, the live override path at past times; its two events reach the security team through
 * the "Emergency overrides" notification rule, dated by itap.seed_finalize_notifications in the same request).
 * Runs only together with a fresh replay; keyed by the drill's justification and the grant reasons as well.
 */
export const DRILL_JUSTIFICATION = 'Quarterly fire drill: full evacuation of the tower';

const EXISTING = `
  query SeedAccessHistoryExisting($org: uuid!, $justification: String!) {
    emergency_overrides(where: { organization_id: { _eq: $org }, justification: { _eq: $justification } }) { id }
    access_grants(where: { organization_id: { _eq: $org }, reason: { _like: "Visit:%" } }, limit: 1) { id }
  }
`;
const GRANTS = `
  mutation SeedVisitorGrants($objects: [access_grants_insert_input!]!) { insert_access_grants(objects: $objects) { affected_rows } }
`;
const DRILL = `
  mutation SeedFireDrill($org: uuid!, $facility: uuid!, $justification: String!, $start: timestamptz!, $end: timestamptz!,
                         $by: uuid!, $until: timestamptz!) {
    drill: seed_emergency_override(args: {
      p_organization: $org, p_facility: $facility, p_mode: "evacuation", p_justification: $justification,
      p_started_at: $start, p_ends_at: $end, p_started_by: $by, p_ended_at: $end, p_ended_by: $by,
      p_end_reason: "All clear: every floor evacuated and accounted for"
    }) { id }
    notifications: seed_finalize_notifications(args: { p_organization: $org, p_until: $until }) { id }
  }
`;

export type SeedAccessHistoryResult = { grants: number; drill: boolean };

export async function seedAccessHistory(
  ctx: SeedContext,
  args: {
    org: string;
    facility: string;
    timezone: string;
    visits: PlannedVisit[];
    users: { admin: string; operator: string };
    area: (path: string) => string;
  },
): Promise<SeedAccessHistoryResult> {
  const { org } = args;
  const existing = await ctx.admin.request<{ emergency_overrides: { id: string }[]; access_grants: { id: string }[] }>(EXISTING, {
    org,
    justification: DRILL_JUSTIFICATION,
  });
  const now = ctx.now.getTime();
  const actor = createHasuraClient(ctx.env, { role: 'admin', userId: args.users.admin, organizationId: org });
  const iso = (ms: number): string => new Date(ms).toISOString();

  let grants = 0;
  if (existing.access_grants.length === 0) {
    const area = args.area(VISITOR_GRANT_AREA);
    const objects = visitGrants(args.visits, args.timezone, now).map((g) => ({
      organization_id: org,
      profile_id: g.profileId,
      area_id: area,
      valid_from: iso(g.validFrom),
      valid_until: iso(g.validUntil),
      single_use: g.singleUse,
      reason: g.reason,
      created_at: iso(g.createdAt),
    }));
    // Through the admin's session: granted_by is stamped from the session member.
    if (objects.length > 0) grants = (await actor.request<{ insert_access_grants: { affected_rows: number } }>(GRANTS, { objects })).insert_access_grants.affected_rows;
  }

  const drill = fireDrill(localDate(now, args.timezone), args.timezone);
  const createDrill = existing.emergency_overrides.length === 0 && drill.end < now;
  if (createDrill) {
    await ctx.admin.request(DRILL, {
      org,
      facility: args.facility,
      justification: DRILL_JUSTIFICATION,
      start: iso(drill.start),
      end: iso(drill.end),
      by: args.users.operator,
      until: iso(now),
    });
  }
  return { grants, drill: createDrill };
}
