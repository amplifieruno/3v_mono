import { defineCronHandler, type CronHandler } from './types.js';

const LIST_ORGANIZATIONS = `query TrackingCronOrganizations { organizations(order_by: { id: asc }) { id } }`;

const CLOSE_STALE = `
  mutation CloseStaleSessions($organization: uuid!, $at: timestamptz!) {
    close_stale_sessions(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;
const EVALUATE_DWELL = `
  mutation EvaluateDwellRules($organization: uuid!, $at: timestamptz!) {
    evaluate_dwell_rules(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;
const LIFECYCLE_JOBS = `
  mutation RunLifecycleJobs($organization: uuid!, $at: timestamptz!) {
    run_lifecycle_jobs(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;

/**
 * A cron that calls one SQL function per organization with the run's scheduled_time (design §8.0, §8.3), so a retry
 * of the same run is a no-op. Every organization is attempted; the run fails (500, Hasura retries) when any failed.
 */
export function perOrganizationCron(field: string, mutation: string): CronHandler {
  return defineCronHandler(async (payload, ctx) => {
    const scheduled = new Date(payload.scheduled_time);
    if (Number.isNaN(scheduled.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
    const at = scheduled.toISOString();
    const { organizations } = await ctx.admin.request<{ organizations: { id: string }[] }>(LIST_ORGANIZATIONS);
    let rows = 0;
    let failed = 0;
    for (const { id } of organizations) {
      try {
        const data = await ctx.admin.request<Record<string, unknown[]>>(mutation, { organization: id, at });
        rows += data[field]?.length ?? 0;
      } catch {
        failed += 1;
      }
    }
    if (failed > 0) throw new Error(`${field}: failed for ${failed} of ${organizations.length} organizations`);
    return { organizations: organizations.length, rows };
  });
}

/** Cron `close_stale_sessions` (every 2 minutes): itap.close_stale_sessions per organization. */
export const closeStaleSessions = perOrganizationCron('close_stale_sessions', CLOSE_STALE);

/** Cron `evaluate_dwell_rules` (every minute): loitering / unusual_dwell events via itap.evaluate_dwell_rules. */
export const evaluateDwellRules = perOrganizationCron('evaluate_dwell_rules', EVALUATE_DWELL);

/** Cron `lifecycle_jobs` (daily): no-show visits, expired profiles and invitations via itap.run_lifecycle_jobs. */
export const lifecycleJobs = perOrganizationCron('run_lifecycle_jobs', LIFECYCLE_JOBS);
