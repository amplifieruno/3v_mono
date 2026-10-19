import { randomUUID } from 'node:crypto';
import { nextRun } from '../reports/cron.js';
import { reportDatasetSchema } from '../reports/dataset.js';
import { renderReportFile } from '../reports/render/index.js';
import { pastReports, SCHEDULES, TEMPLATES, type PastReport } from './reportPlan.js';
import type { SeedContext } from './tenancy.js';

/**
 * Reports of the seed (slice 7, design §9): system templates (both organizations), the Nova Tower schedules and the
 * past reports (reportPlan). A past report runs through the real pipeline: inserted queued (targets in the same
 * insert, while targets may still change) and claimed in the same transaction (itap.claim_report: generating, attempt 1,
 * so the live render_report handler finds nothing to claim), itap.compute_report (metrics + dataset), the report renderer, an upload to
 * the organization bucket, then itap.complete_report (report_generated event, schedule deliveries, Stage C). The same
 * request back-dates the report and its event to the planned time, and itap.seed_finalize_notifications dates the
 * deliveries and inbox rows at the event time (email sent; in-app read). The failed report is claimed and then failed
 * with its error (itap.fail_report, the generator's failure path). The schedules get last_run_at = their latest seeded
 * run and next_run_at = the next cron instant. Idempotent: templates and schedules by name; past reports only when the
 * organization has none.
 */
export type SeedReportsResult = { templates: number; schedules: number; reports: number; failed: number };

const EXISTING = `
  query SeedReportConfig($org: uuid!) {
    report_templates(where: { organization_id: { _eq: $org } }) { id name }
    report_schedules(where: { organization_id: { _eq: $org } }) { id name }
    recipient_groups(where: { organization_id: { _eq: $org } }) { id name }
    reports_aggregate(where: { organization_id: { _eq: $org } }) { aggregate { count } }
  }
`;
const INSERT_TEMPLATES = `
  mutation SeedReportTemplates($objects: [report_templates_insert_input!]!) { insert_report_templates(objects: $objects) { affected_rows } }
`;
const INSERT_SCHEDULES = `
  mutation SeedReportSchedules($objects: [report_schedules_insert_input!]!) { insert_report_schedules(objects: $objects) { affected_rows } }
`;
// Inserted queued (targets in the same insert) and claimed in the same transaction: generating, attempt 1, so the
// live render_report handler finds nothing to claim.
const START = `
  mutation SeedReportStart($report: reports_insert_input!, $id: uuid!) {
    insert_reports_one(object: $report) { id }
    claim_report(args: { p_report: $id }) { id code attempts }
  }
`;
const FAIL = `
  mutation SeedReportFail($id: uuid!, $error: String!) { fail_report(args: { p_report: $id, p_attempt: 1, p_error: $error }) { id } }
`;
const SCHEDULE_RUNS = `
  mutation SeedScheduleRuns($id: uuid!, $last: timestamptz!, $next: timestamptz!) {
    update_report_schedules_by_pk(pk_columns: { id: $id }, _set: { last_run_at: $last, next_run_at: $next }) { id }
  }
`;
const COMPUTE = `
  mutation SeedComputeReport($id: uuid!) { compute_report(args: { p_report: $id, p_attempt: 1 }) { dataset } }
`;
const COMPLETE = `
  mutation SeedCompleteReport(
    $org: uuid!, $id: uuid!, $file: uuid!, $summary: jsonb!, $at: timestamptz!, $requested: timestamptz!, $key: String!,
    $until: timestamptz!
  ) {
    complete_report(args: { p_report: $id, p_attempt: 1, p_file: $file, p_summary: $summary }) { id }
    update_reports_by_pk(pk_columns: { id: $id }, _set: { generated_at: $at, created_at: $requested }) { id }
    update_events(where: { organization_id: { _eq: $org }, dedup_key: { _eq: $key } }, _set: { occurred_at: $at, created_at: $at }) {
      affected_rows
    }
    seed_finalize_notifications(args: { p_organization: $org, p_until: $until }) { id }
  }
`;

type Named = { id: string; name: string };
type Existing = {
  report_templates: Named[];
  report_schedules: Named[];
  recipient_groups: Named[];
  reports_aggregate: { aggregate: { count: number } };
};

const MINUTE = 60_000;
const iso = (ms: number): string => new Date(ms).toISOString();

function need(map: Map<string, string>, name: string, what: string): string {
  const id = map.get(name);
  if (!id) throw new Error(`seed: ${what} ${name} missing`);
  return id;
}

/** One past report: real computation and rendering, back-dated completion (or the planned failure). */
async function generatePast(
  ctx: SeedContext,
  args: { org: string; adminUser: string; facility: string; timezone: string; templates: Map<string, string>; schedules: Map<string, string> },
  plan: PastReport,
): Promise<void> {
  const { org } = args;
  const id = randomUUID();
  const requested = plan.generatedAt - 2 * MINUTE;
  const template = TEMPLATES.find((t) => t.name === plan.template);
  const report = {
    id,
    organization_id: org,
    report_type: plan.report_type,
    title: plan.title,
    parameters: { ...(template?.period ? { period: template.period } : {}), timezone: args.timezone },
    start_date: plan.start_date,
    end_date: plan.end_date,
    format: plan.format,
    template_id: need(args.templates, plan.template, 'report template'),
    schedule_id: plan.schedule ? need(args.schedules, plan.schedule, 'report schedule') : null,
    created_by: plan.schedule ? null : args.adminUser,
    created_at: iso(requested),
    ...(plan.facilityTarget ? { report_facilities: { data: [{ facility_id: args.facility }] } } : {}),
  };
  const { claim_report: claimed } = await ctx.admin.request<{ claim_report: { code: string; attempts: number }[] }>(START, { report, id });
  const started = claimed[0];
  if (started?.attempts !== 1) throw new Error(`seed: report ${plan.title} was not claimed`);
  if (plan.error) {
    // The real failure path: claimed, then failed with the error (as generateReport records a failed upload).
    await ctx.admin.request(FAIL, { id, error: plan.error });
    return;
  }
  const { compute_report: computed } = await ctx.admin.request<{ compute_report: { dataset: unknown }[] }>(COMPUTE, { id });
  const dataset = reportDatasetSchema.parse(computed[0]?.dataset);
  const generated = new Intl.DateTimeFormat('sv-SE', {
    timeZone: args.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(plan.generatedAt));
  const file = renderReportFile({ ...dataset, generated_at: generated }, plan.format);
  const name = `${started.code}.${file.extension}`;
  const { id: fileId } = await ctx.storage.upload({
    bucketId: org.toLowerCase(),
    name,
    mimeType: file.mimeType,
    data: file.data,
    metadata: { kind: 'report', report_id: id },
  });
  await ctx.admin.request(COMPLETE, {
    org,
    id,
    file: fileId,
    summary: { row_count: dataset.rows.length, truncated: dataset.truncated, file_name: name, size_bytes: file.data.length, items: dataset.summary },
    at: iso(plan.generatedAt),
    requested: iso(requested),
    key: `report:${id}:report_generated`,
    until: iso(plan.generatedAt + 10 * MINUTE),
  });
}

export async function seedReports(
  ctx: SeedContext,
  args: { org: string; adminUser: string; facility: string; timezone: string; configuredAt: number; history: boolean },
): Promise<SeedReportsResult> {
  const { org } = args;
  const load = () => ctx.admin.request<Existing>(EXISTING, { org });
  let existing = await load();
  const haveTemplates = new Set(existing.report_templates.map((t) => t.name));
  const templates = TEMPLATES.filter((t) => !haveTemplates.has(t.name)).map((t) => ({
    organization_id: org,
    name: t.name,
    description: t.description,
    report_type: t.report_type,
    format: t.format,
    parameters: t.period ? { period: t.period } : {},
    is_system: true,
    created_at: iso(args.configuredAt),
  }));
  if (templates.length > 0) await ctx.admin.request(INSERT_TEMPLATES, { objects: templates });
  if (!args.history) return { templates: templates.length, schedules: 0, reports: 0, failed: 0 };

  existing = await load();
  const templateIds = new Map(existing.report_templates.map((t) => [t.name, t.id]));
  const groups = new Map(existing.recipient_groups.map((g) => [g.name, g.id]));
  const haveSchedules = new Set(existing.report_schedules.map((s) => s.name));
  const schedules = SCHEDULES.filter((s) => !haveSchedules.has(s.name)).map((s) => ({
    organization_id: org,
    name: s.name,
    template_id: need(templateIds, s.template, 'report template'),
    cron: s.cron,
    timezone: args.timezone,
    channel: s.channel,
    recipient_group_id: need(groups, s.group, 'recipient group'),
    created_by: args.adminUser,
    created_at: iso(args.configuredAt),
  }));
  if (schedules.length > 0) await ctx.admin.request(INSERT_SCHEDULES, { objects: schedules });
  if (existing.reports_aggregate.aggregate.count > 0) return { templates: templates.length, schedules: schedules.length, reports: 0, failed: 0 };

  existing = await load();
  const scheduleIds = new Map(existing.report_schedules.map((s) => [s.name, s.id]));
  const plans = pastReports(ctx.now, args.timezone);
  for (const plan of plans) {
    await generatePast(ctx, { ...args, templates: templateIds, schedules: scheduleIds }, plan);
  }
  // The schedules ran when their seeded reports were made: last run = the latest of them, next run = the next cron
  // instant after now (the live cron neither re-initializes them nor replays a run).
  for (const spec of SCHEDULES) {
    const runs = plans.filter((p) => p.schedule === spec.name && p.runAt !== null).map((p) => p.runAt ?? 0);
    const next = nextRun(spec.cron, args.timezone, ctx.now);
    if (runs.length === 0 || !next) continue;
    await ctx.admin.request(SCHEDULE_RUNS, {
      id: need(scheduleIds, spec.name, 'report schedule'),
      last: iso(Math.max(...runs)),
      next: next.toISOString(),
    });
  }
  return {
    templates: templates.length,
    schedules: schedules.length,
    reports: plans.filter((p) => !p.error).length,
    failed: plans.filter((p) => p.error).length,
  };
}
