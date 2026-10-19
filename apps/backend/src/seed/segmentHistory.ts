import type { HasuraClient } from '../hasura/client.js';
import { matchingSubjects } from '../segments/evaluate.js';
import type { HistorySync } from './segmentMutation.js';
import type { SegmentSpec } from './segmentPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Past memberships of the seeded dynamic segments, matched by the real evaluator (matchingSubjects: the backend
 * translator, run as an org_admin session) at each history time, after itap.run_activity_stats at that time.
 *
 * Behavioral metrics at a past time are exact because the replay is complete and refresh_activity_stats only uses
 * sessions started, events and area entries before its p_at (sessions running at p_at are capped at it). Attributes
 * (profile type, status, dates, schedules, links) are today's values: the seed changes none of them during the
 * history. The stats tables are shared with the hourly evaluate_segments cron: when a refresh of another time lands
 * while one time is being matched (the stats rows' as_of is not that time afterwards), the time is matched again.
 */
const RUN_STATS = `
  mutation SeedSegmentStats($org: uuid!, $at: timestamptz!) {
    run_activity_stats(args: { p_organization: $org, p_at: $at }) { identity_rows profile_rows }
  }
`;
const OTHER_STATS = `
  query SeedSegmentStatsAsOf($org: uuid!, $at: timestamptz!) {
    identities: identity_activity_stats_aggregate(where: { organization_id: { _eq: $org }, as_of: { _neq: $at } }) { aggregate { count } }
    profiles: profile_activity_stats_aggregate(where: { organization_id: { _eq: $org }, as_of: { _neq: $at } }) { aggregate { count } }
  }
`;

const MAX_ATTEMPTS = 3;

type Count = { aggregate: { count: number } };

export async function matchSegmentHistory(
  ctx: SeedContext,
  args: { org: string; reader: HasuraClient; segments: { id: string; spec: SegmentSpec }[]; times: number[] },
): Promise<HistorySync[]> {
  const evaluated = args.segments.filter((s) => s.spec.kind === 'dynamic' && s.spec.status === 'active');
  if (evaluated.length === 0) return [];
  const syncs: HistorySync[] = [];
  for (const time of args.times) {
    const at = new Date(time).toISOString();
    for (let attempt = 1; ; attempt += 1) {
      await ctx.admin.request(RUN_STATS, { org: args.org, at });
      const matched: HistorySync[] = [];
      for (const { id, spec } of evaluated) {
        const ids = await matchingSubjects(args.reader, { target: spec.target, conditions: spec.conditions, at });
        matched.push({ segmentId: id, at: time, ids });
      }
      const other = await ctx.admin.request<{ identities: Count; profiles: Count }>(OTHER_STATS, { org: args.org, at });
      if (other.identities.aggregate.count + other.profiles.aggregate.count === 0) {
        syncs.push(...matched);
        break;
      }
      if (attempt >= MAX_ATTEMPTS) throw new Error(`seed: activity stats kept changing while matching segments at ${at}`);
    }
  }
  return syncs;
}
