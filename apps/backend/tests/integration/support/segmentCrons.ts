import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { evaluateSegmentsHourly, evaluateSegmentsPending } from '../../../src/segments/crons.js';
import type { CronHandler } from '../../../src/events/types.js';
import { asAdmin, testEnv } from './clients.js';
import { runSqlRows } from './sql.js';

/** Segment evaluation crons (slice 6, task 3): in-process handler runs restricted to the test's organizations. */

type OrgRow = { id?: string; organization_id?: string };

/** The handlers list every organization of the shared dev database; the test keeps only its own. */
function scopedAdmin(orgIds: string[]): HasuraClient {
  const admin = asAdmin();
  const keep = (rows: OrgRow[]) => rows.filter((r) => orgIds.includes(r.organization_id ?? r.id ?? ''));
  return {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      const lists = data as { organizations?: OrgRow[]; due_segment_evaluations?: OrgRow[] };
      if (lists.organizations) lists.organizations = keep(lists.organizations);
      if (lists.due_segment_evaluations) lists.due_segment_evaluations = keep(lists.due_segment_evaluations);
      return data;
    },
  };
}

async function run(handler: CronHandler, name: string, orgIds: string[], at: string): Promise<Record<string, unknown>> {
  const result = await handler.handle(
    { id: randomUUID(), name, scheduled_time: at, payload: {}, comment: null },
    { env: testEnv(), admin: scopedAdmin(orgIds), idempotencyKey: `${name}:${randomUUID()}` },
  );
  return { ...result };
}

/** Cron `evaluate_segments_pending` at `at` for the given organizations only. */
export const runPending = (orgIds: string[], at: string) => run(evaluateSegmentsPending, 'evaluate_segments_pending', orgIds, at);

/** Cron `evaluate_segments` (hourly) at `at` for the given organizations only. */
export const runHourly = (orgIds: string[], at: string) => run(evaluateSegmentsHourly, 'evaluate_segments', orgIds, at);

export type RequestRow = { requested_at: string; first_requested_at: string | null; last_processed_at: string | null; pending: string };

/** The organization's evaluation request row (SQL), or undefined. */
export async function requestRow(org: string): Promise<RequestRow | undefined> {
  const [row] = await runSqlRows(
    `SELECT requested_at, first_requested_at, last_processed_at,
            (last_processed_at IS NULL OR requested_at > last_processed_at)::text AS pending
     FROM itap.segment_evaluation_requests WHERE organization_id = '${org}'`,
  );
  return row as RequestRow | undefined;
}

export const isPending = async (org: string): Promise<boolean> => (await requestRow(org))?.pending === 'true';

/** Seconds after now, ISO. */
export const fromNow = (seconds: number): string => new Date(Date.now() + seconds * 1000).toISOString();

export type DailyStat = { day: string; member_count: number; added: number; removed: number };

export async function dailyStats(segment: string): Promise<DailyStat[]> {
  const data = await asAdmin().request<{ segment_daily_stats: DailyStat[] }>(
    `query($s: uuid!) { segment_daily_stats(where: {segment_id: {_eq: $s}}, order_by: {day: asc}) { day member_count added removed } }`,
    { s: segment },
  );
  return data.segment_daily_stats;
}

/** itap.refresh_segment_daily_stats(org, at) (admin-only mutation). */
export async function refreshDailyStats(org: string, at: string): Promise<DailyStat[]> {
  const data = await asAdmin().request<{ refresh_segment_daily_stats: DailyStat[] }>(
    `mutation($o: uuid!, $at: timestamptz!) {
       refresh_segment_daily_stats(args: {p_organization: $o, p_at: $at}, order_by: [{segment_id: asc}, {day: asc}]) {
         day member_count added removed
       }
     }`,
    { o: org, at },
  );
  return data.refresh_segment_daily_stats;
}

export type EvaluationStatus = { last_evaluated_at: string | null; last_evaluation_error: string | null; last_evaluation_failed_at: string | null };

export async function evaluationStatus(segment: string): Promise<EvaluationStatus> {
  const data = await asAdmin().request<{ segments_by_pk: EvaluationStatus }>(
    `query($id: uuid!) { segments_by_pk(id: $id) { last_evaluated_at last_evaluation_error last_evaluation_failed_at } }`,
    { id: segment },
  );
  return data.segments_by_pk;
}
