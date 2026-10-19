import { perOrganizationCron } from './trackingCrons.js';

const AGGREGATE_STATS = `
  mutation AggregateStats($organization: uuid!, $at: timestamptz!) {
    aggregate_stats(args: { p_organization: $organization, p_at: $at }) { hourly_rows }
  }
`;

/**
 * Cron `aggregate_stats` (hourly at minute 5): itap.aggregate_stats per organization with the scheduled time, i.e. the
 * previous complete UTC hour plus the facility-local day(s) it touches. Idempotent per hour bucket, so a retry or a
 * late run re-aggregates the same buckets. Activity stats are refreshed by `evaluate_segments`, not here.
 */
export const aggregateStatsCron = perOrganizationCron('aggregate_stats', AGGREGATE_STATS);
