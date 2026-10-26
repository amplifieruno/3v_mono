import { createHasuraClient } from '../hasura/client.js';
import { dashboards } from './analyticsPlan.js';
import { seedBulkJobs, type SeedBulkResult } from './analyticsBulk.js';
import { seedReports, type SeedReportsResult } from './analyticsReports.js';
import { searchImages, seedSearches, type SeedSearchResult } from './analyticsSearch.js';
import type { SeedFacilitiesResult } from './facilities.js';
import { SEED_FACILITIES } from './facilityPlan.js';
import { configurationTime, replayDays } from './historyTime.js';
import type { SeedContext, SeedTenancyResult } from './tenancy.js';

/**
 * Analytics of the seed (slice 7, design §9), after the history and segments:
 * 1. stats: itap.aggregate_stats_range over the replay period up to now for both organizations. The replay already
 *    aggregated every replayed day (historyMutation), so this adds the rows written after the replay (estimated
 *    locations, the last partial hour) and fills the stats of a database seeded before slice 7. Idempotent (an
 *    unchanged bucket is not rewritten).
 * 2. reports (analyticsReports), 3. searches and saved searches (analyticsSearch), 4. bulk jobs (analyticsBulk),
 * 5. dashboards: "Security overview" (shared, the admin's) and "Facility manager" (personal, the Nova Tower admin's), each its owner's landing dashboard,
 *    inserted with the owner's org_admin session (owner stamped from it), keyed by owner and name.
 * Riverside stays minimal: stats and the system report templates.
 */
export type SeedAnalyticsResult = {
  stats: Record<'nova' | 'riverside', { hourly: number; daily: number; transitions: number }>;
  reports: SeedReportsResult;
  searches: SeedSearchResult;
  bulk: SeedBulkResult;
  dashboards: number;
  durationMs: number;
};

const AGGREGATE = `
  mutation SeedAggregateStats($org: uuid!, $from: timestamptz!, $to: timestamptz!) {
    aggregate_stats_range(args: { p_organization: $org, p_from: $from, p_to: $to }) { hourly_rows daily_rows transition_rows }
  }
`;
const DASHBOARD = `
  mutation SeedDashboard($object: dashboards_insert_input!) {
    insert_dashboards_one(object: $object, on_conflict: { constraint: dashboards_owner_name_key, update_columns: [] }) { id }
  }
`;

const iso = (ms: number): string => new Date(ms).toISOString();

async function aggregate(ctx: SeedContext, org: string, from: number): Promise<{ hourly: number; daily: number; transitions: number }> {
  type Row = { hourly_rows: number; daily_rows: number; transition_rows: number };
  const { aggregate_stats_range: rows } = await ctx.admin.request<{ aggregate_stats_range: Row[] }>(AGGREGATE, {
    org,
    from: iso(from),
    to: ctx.now.toISOString(),
  });
  const sum = (key: keyof Row) => rows.reduce((n, r) => n + r[key], 0);
  return { hourly: sum('hourly_rows'), daily: sum('daily_rows'), transitions: sum('transition_rows') };
}

export async function seedAnalytics(
  ctx: SeedContext,
  tenancy: SeedTenancyResult,
  facilities: SeedFacilitiesResult,
): Promise<SeedAnalyticsResult> {
  const started = Date.now();
  const { timezone } = SEED_FACILITIES.nova;
  const nova = tenancy.orgs.nova;
  const riverside = tenancy.orgs.riverside;
  const from = (replayDays(ctx.now, timezone)[0]?.start ?? ctx.now.getTime()) - 3_600_000;
  const stats = { nova: await aggregate(ctx, nova, from), riverside: await aggregate(ctx, riverside, from) };

  const { admin, novaAdmin, riversideAdmin } = tenancy.users;
  const configuredAt = configurationTime(ctx.now, timezone);
  const facility = facilities.facilities.nova;
  const reports = await seedReports(ctx, { org: nova, adminUser: admin, facility, timezone, configuredAt, history: true });
  await seedReports(ctx, { org: riverside, adminUser: riversideAdmin, facility: facilities.facilities.riverside, timezone, configuredAt, history: false });

  const images = searchImages(ctx, nova, admin);
  const searches = await seedSearches(ctx, { org: nova, user: admin, facility, timezone, images });
  const bulk = await seedBulkJobs(ctx, { org: nova, admin, novaAdmin, timezone, images });

  const owners = { admin, novaAdmin };
  for (const d of dashboards(facility)) {
    const owner = createHasuraClient(ctx.env, { role: 'org_admin', userId: owners[d.owner], organizationId: nova });
    await owner.request(DASHBOARD, { object: { name: d.name, description: d.description, is_shared: d.is_shared, is_default: d.is_default, layout: { columns: 12 }, widgets: d.widgets } });
  }
  return { stats, reports, searches, bulk, dashboards: dashboards(facility).length, durationMs: Date.now() - started };
}
