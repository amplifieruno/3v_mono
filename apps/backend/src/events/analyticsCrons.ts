import { perOrganizationCron } from './trackingCrons.js';

const AGGREGATE_STATS = `
  mutation AggregateStats($organization: uuid!, $at: timestamptz!) {
    aggregate_stats(args: { p_organization: $organization, p_at: $at }) { hourly_rows }
  }
`;

/**
 * Cron `aggregate_stats` (hourly at minute 5): itap.aggregate_stats per organization with the scheduled time, i.e. a
 * trailing window [hour_floor(at - max tracking timeout - 180 s) - 1 h, hour_floor(at)) plus the facility-local day(s)
 * it touches, so late session closes and a missed run heal on the next run. Idempotent (upserts only changed rows), so
 * a retry re-aggregates the same buckets. Activity stats are refreshed by `evaluate_segments`, not here.
 */
export const aggregateStatsCron = perOrganizationCron('aggregate_stats', AGGREGATE_STATS);
