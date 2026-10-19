import type { Env } from '../config/env.js';
import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import { defineCronHandler, type CronHandler, type CronTriggerPayload } from '../events/types.js';
import { evaluateSegment, mapSegmentError, SegmentError, type EvaluateResult } from './evaluate.js';

/**
 * Segment evaluation crons (spec §8.3; slice 6 task 3), both through the one evaluator (evaluateSegment):
 * - `evaluate_segments_pending` (every minute): organizations whose segment inputs changed at least 30 s ago
 *   (itap.due_segment_evaluations at scheduled_time, debounce) get their dynamic segments evaluated at
 *   max(scheduled_time, now); the request is then finished with the requested_at it was read with (a write committed
 *   meanwhile keeps it pending), unless a sync came back stale or a segment failed transiently: then it stays pending
 *   for the next run, so no input change is dropped;
 * - `evaluate_segments` (hourly): per organization refresh_activity_stats, every dynamic segment, segment_daily_stats.
 * The hourly activity and daily stats run at the run's scheduled_time; its segments are evaluated at
 * max(scheduled_time, now) like the pending cron (a late run reads current inputs, and an evaluation stamped before an
 * evaluate_segment already recorded would be stale; a retry re-syncs to the same result). A segment whose evaluation fails is
 * recorded on the segment (last_evaluation_error / last_evaluation_failed_at) and the others continue; a failure of
 * an organization-level step fails the run (500, Hasura retries) after every organization was attempted.
 */

/** Per organization: `reader` = org_admin session (Hasura permissions apply), `writer` = admin secret + org session. */
export type OrganizationClients = { reader: HasuraClient; writer: HasuraClient };
export type ClientsFor = (env: Env, organizationId: string) => OrganizationClients;
export type Evaluate = (clients: OrganizationClients, segmentId: string, at: string) => Promise<EvaluateResult>;

export const organizationClients: ClientsFor = (env, organizationId) => ({
  reader: createHasuraClient(env, { role: 'org_admin', organizationId }),
  writer: createHasuraClient(env, { role: 'admin', organizationId }),
});

const DYNAMIC_SEGMENTS = `
  query SegmentsToEvaluate($organization: uuid!) {
    segments(
      where: {
        organization_id: { _eq: $organization }
        kind: { _eq: dynamic }
        _or: [
          { status: { _eq: active } }
          { segment_members: { source: { _eq: rule }, removed_at: { _is_null: true } } }
        ]
      }
      order_by: { id: asc }
    ) { id }
  }
`;
const RECORD_FAILURE = `
  mutation RecordSegmentEvaluationFailure($id: uuid!, $error: String!, $at: timestamptz!) {
    update_segments_by_pk(pk_columns: { id: $id }, _set: { last_evaluation_error: $error, last_evaluation_failed_at: $at }) {
      id
    }
  }
`;
const ORGANIZATIONS = `query SegmentCronOrganizations { organizations(order_by: { id: asc }) { id } }`;
const DUE = `
  query DueSegmentEvaluations($at: timestamptz!) {
    due_segment_evaluations(args: { p_at: $at }) { organization_id requested_at }
  }
`;
const FINISH = `
  mutation FinishSegmentEvaluationRequest($organization: uuid!, $requested: timestamptz!) {
    finish_segment_evaluation_request(args: { p_organization: $organization, p_requested_at: $requested }) {
      organization_id
    }
  }
`;
const ACTIVITY_STATS = `
  mutation RunActivityStats($organization: uuid!, $at: timestamptz!) {
    run_activity_stats(args: { p_organization: $organization, p_at: $at }) { identity_rows profile_rows }
  }
`;
const DAILY_STATS = `
  mutation RefreshSegmentDailyStats($organization: uuid!, $at: timestamptz!) {
    refresh_segment_daily_stats(args: { p_organization: $organization, p_at: $at }) { id }
  }
`;

const MAX_ERROR_LENGTH = 1000;

/** The stored failure text: the segment code (with its condition path) or the error message. */
export function failureText(error: unknown): string {
  const mapped = mapSegmentError(error);
  const text = mapped instanceof Error ? mapped.message : String(mapped);
  return (text || 'evaluation_failed').slice(0, MAX_ERROR_LENGTH);
}

/**
 * `incomplete`: some segment does not reflect the inputs as of `at`: its sync was stale (a later evaluation, e.g. the
 * evaluate_segment action, is already recorded) or it failed for a transient reason (network, Hasura, unknown). A
 * failure with a segment code (e.g. segment_condition_invalid: the stored condition no longer translates) is
 * deterministic: recorded, not incomplete (retrying cannot help).
 */
export type OrganizationEvaluation = { segments: number; failed: number; incomplete: boolean };

/** Evaluates the organization's dynamic segments at `at`; per-segment failures are recorded, never thrown. */
export async function evaluateOrganizationSegments(
  deps: { admin: HasuraClient; clients: OrganizationClients; evaluate?: Evaluate },
  organizationId: string,
  at: string,
): Promise<OrganizationEvaluation> {
  const evaluate = deps.evaluate ?? evaluateSegment;
  const { segments } = await deps.admin.request<{ segments: { id: string }[] }>(DYNAMIC_SEGMENTS, { organization: organizationId });
  let failed = 0;
  let incomplete = false;
  for (const { id } of segments) {
    try {
      const result = await evaluate(deps.clients, id, at);
      if (result.stale) incomplete = true;
    } catch (error: unknown) {
      const mapped = mapSegmentError(error);
      // Deleted since it was listed: nothing to evaluate.
      if (mapped instanceof SegmentError && mapped.code === 'segment_not_found') continue;
      if (!(mapped instanceof SegmentError)) incomplete = true;
      failed += 1;
      await deps.admin.request(RECORD_FAILURE, { id, error: failureText(error), at });
    }
  }
  return { segments: segments.length, failed, incomplete };
}

function scheduledAt(payload: CronTriggerPayload): string {
  const scheduled = new Date(payload.scheduled_time);
  if (Number.isNaN(scheduled.getTime())) throw new Error(`Invalid scheduled_time: ${payload.scheduled_time}`);
  return scheduled.toISOString();
}

type Totals = { organizations: number; segments: number; failed: number; failedOrganizations: number };

function finish(name: string, totals: Totals): Record<string, number> {
  if (totals.failedOrganizations > 0) {
    throw new Error(`${name}: failed for ${totals.failedOrganizations} of ${totals.organizations} organizations`);
  }
  return { organizations: totals.organizations, segments: totals.segments, failed: totals.failed };
}

export type SegmentCronOptions = { clientsFor?: ClientsFor; evaluate?: Evaluate; now?: () => number };

/** Cron `evaluate_segments_pending`: debounced evaluation of organizations whose inputs changed. */
export function createEvaluateSegmentsPending(options: SegmentCronOptions = {}): CronHandler {
  const clientsFor = options.clientsFor ?? organizationClients;
  const now = options.now ?? Date.now;
  return defineCronHandler(async (payload, ctx) => {
    const scheduled = scheduledAt(payload);
    const { due_segment_evaluations: due } = await ctx.admin.request<{
      due_segment_evaluations: { organization_id: string; requested_at: string }[];
    }>(DUE, { at: scheduled });
    // Evaluate as of now when the run is late: the inputs read are current, and an evaluation stamped earlier than an
    // evaluate_segment action already recorded would be stale (ignored by sync_segment_members).
    const at = new Date(Math.max(Date.parse(scheduled), now())).toISOString();
    const totals: Totals = { organizations: due.length, segments: 0, failed: 0, failedOrganizations: 0 };
    let pending = 0;
    for (const request of due) {
      try {
        const clients = clientsFor(ctx.env, request.organization_id);
        const result = await evaluateOrganizationSegments(
          { admin: ctx.admin, clients, evaluate: options.evaluate },
          request.organization_id,
          at,
        );
        totals.segments += result.segments;
        totals.failed += result.failed;
        // Incomplete (stale sync, transient failure): the request stays pending for the next run.
        if (result.incomplete) pending += 1;
        else await ctx.admin.request(FINISH, { organization: request.organization_id, requested: request.requested_at });
      } catch {
        totals.failedOrganizations += 1;
      }
    }
    return { ...finish('evaluate_segments_pending', totals), pending };
  });
}

/** Cron `evaluate_segments` (hourly): activity stats, every dynamic segment, daily stats, per organization. */
export function createEvaluateSegmentsHourly(options: SegmentCronOptions = {}): CronHandler {
  const clientsFor = options.clientsFor ?? organizationClients;
  const now = options.now ?? Date.now;
  return defineCronHandler(async (payload, ctx) => {
    const at = scheduledAt(payload);
    const evaluatedAt = new Date(Math.max(Date.parse(at), now())).toISOString();
    const { organizations } = await ctx.admin.request<{ organizations: { id: string }[] }>(ORGANIZATIONS);
    const totals: Totals = { organizations: organizations.length, segments: 0, failed: 0, failedOrganizations: 0 };
    for (const { id } of organizations) {
      try {
        await ctx.admin.request(ACTIVITY_STATS, { organization: id, at });
        const result = await evaluateOrganizationSegments(
          { admin: ctx.admin, clients: clientsFor(ctx.env, id), evaluate: options.evaluate },
          id,
          evaluatedAt,
        );
        await ctx.admin.request(DAILY_STATS, { organization: id, at });
        totals.segments += result.segments;
        totals.failed += result.failed;
      } catch {
        totals.failedOrganizations += 1;
      }
    }
    return finish('evaluate_segments', totals);
  });
}

export const evaluateSegmentsPending = createEvaluateSegmentsPending();
export const evaluateSegmentsHourly = createEvaluateSegmentsHourly();
