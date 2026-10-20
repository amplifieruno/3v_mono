import { runExport } from '../exports/run.js';
import type { HasuraClient } from '../hasura/client.js';
import { localAt } from './analyticsPlan.js';
import { EXPORTS } from './complianceFlowsPlan.js';
import { waitFor } from './waitFor.js';
import type { SeedContext } from './tenancy.js';

/**
 * Export definitions of Nova Tower (slice 10), owned by the Nova Tower admin (inserted with their org_admin session:
 * owner stamped), and their jobs produced by the real export runner (exports/run.ts): the job is inserted as the
 * owner, run in-process (it queries Hasura as the owner with a signed organization token, so permissions decide rows
 * and columns; the live run_export trigger may claim it first — the claim decides) and back-dated once finished. The
 * incremental definition runs twice with 5000 rows per run: the second job continues from the first one's cursor.
 * Keyed by name; jobs only for a definition created now.
 */
export type SeedExportsResult = { definitions: number; jobs: number; rows: number };

const iso = (ms: number): string => new Date(ms).toISOString();

const EXISTING = `query SeedExportDefinitions($org: uuid!) { export_definitions(where: { organization_id: { _eq: $org } }) { name } }`;
const INSERT_DEFINITION = `
  mutation SeedExportDefinition($object: export_definitions_insert_input!) { insert_export_definitions_one(object: $object) { id } }
`;
const INSERT_JOB = `mutation SeedExportJob($definition: uuid!) { insert_export_jobs_one(object: { definition_id: $definition }) { id } }`;
const JOB = `query SeedExportJobState($id: uuid!) { export_jobs_by_pk(id: $id) { status row_count error created_at started_at finished_at } }`;
const BACKDATE = `
  mutation SeedBackdateExport($id: uuid!, $created: timestamptz!, $started: timestamptz!, $finished: timestamptz!) {
    update_export_jobs_by_pk(pk_columns: { id: $id }, _set: { created_at: $created, started_at: $started, finished_at: $finished }) { id }
  }
`;

type JobState = { status: string; row_count: number | null; error: string | null; started_at: string | null; finished_at: string | null };

async function runJob(ctx: SeedContext, owner: HasuraClient, definition: string, at: number): Promise<number> {
  const { insert_export_jobs_one: job } = await owner.request<{ insert_export_jobs_one: { id: string } }>(INSERT_JOB, { definition });
  await runExport(job.id, { env: ctx.env, admin: ctx.admin, storage: ctx.storage });
  const state = await waitFor(
    async () => (await ctx.admin.request<{ export_jobs_by_pk: JobState | null }>(JOB, { id: job.id })).export_jobs_by_pk,
    (s) => s !== null && (s.status === 'completed' || s.status === 'failed'),
    120_000,
    `export job ${job.id}`,
  );
  if (!state || state.status !== 'completed') throw new Error(`seed: export job ${job.id} failed (${state?.error ?? 'unknown'})`);
  const started = Date.parse(state.started_at ?? '');
  const took = Math.max(1_000, Date.parse(state.finished_at ?? '') - started || 1_000);
  await ctx.admin.request(BACKDATE, { id: job.id, created: iso(at - 3_000), started: iso(at), finished: iso(at + took) });
  return state.row_count ?? 0;
}

export async function seedExports(
  ctx: SeedContext,
  args: { org: string; owner: HasuraClient; timezone: string },
): Promise<SeedExportsResult> {
  const { export_definitions: rows } = await ctx.admin.request<{ export_definitions: { name: string }[] }>(EXISTING, { org: args.org });
  const names = new Set(rows.map((r) => r.name));
  const result: SeedExportsResult = { definitions: 0, jobs: 0, rows: 0 };
  for (const [index, spec] of EXPORTS.entries()) {
    if (names.has(spec.name)) continue;
    const { insert_export_definitions_one: d } = await args.owner.request<{ insert_export_definitions_one: { id: string } }>(INSERT_DEFINITION, {
      object: {
        name: spec.name, description: spec.description, entity: spec.entity, format: spec.format, mode: spec.mode,
        filters: spec.filters, schedule_cron: spec.scheduleCron, timezone: args.timezone, max_rows: spec.maxRows ?? null,
      },
    });
    result.definitions += 1;
    for (let j = 0; j < spec.jobs; j += 1) {
      // One job per day ending yesterday, in the morning (definitions staggered by 20 minutes).
      const at = localAt(ctx.now, args.timezone, spec.jobs - j, 6 * 60 + index * 20);
      result.rows += await runJob(ctx, args.owner, d.id, at);
      result.jobs += 1;
    }
  }
  return result;
}
