import { randomBytes } from 'node:crypto';
import { encryptSecret, serverKeys } from '../auth-service/crypto.js';
import type { HasuraClient } from '../hasura/client.js';
import { runSync } from '../integrations/sync.js';
import {
  BMS_FAILED_RUNS,
  BMS_OK_HOURS_AGO,
  HR_EXTERNAL_ID_FIELD,
  HR_FIELD_MAPPING,
  HR_FIXTURES,
  HR_RUNS,
  INTEGRATIONS,
  SIEM_RUN_HOURS_AGO,
} from './complianceFlowsPlan.js';
import { localAt } from './analyticsPlan.js';
import type { SeedContext } from './tenancy.js';
import { waitFor } from './waitFor.js';

/**
 * Integrations of Nova Tower (slice 10) with a sync history through the real sync job (integrations/sync.ts):
 * - HR (Workday fixture): v1 two weeks ago (creates, one bad record skipped), v2 a week ago (updates, a leaver
 *   deactivated, new hires), v2 again yesterday (no changes); fixture files of kind integration_fixture.
 * - SIEM: three ok stub runs (events pushed since the last sync); an encrypted demo secret when
 *   AUTH_KEY_ENCRYPTION_KEY is set (same crypto as set_integration_secret).
 * - BMS: an ok run yesterday, then config.simulate_error and two failing runs now — the real failure path (integration
 *   status error, one integration_failed event per run; events are append-only, so these runs are not back-dated).
 * Each run is requested with itap.request_integration_sync and run in-process (the live run_sync trigger may claim it
 * first: the claim decides, the seed waits for the end state); finished runs are back-dated to their time. Schedules
 * (HR daily, SIEM hourly) are configured after the history. Keyed by name: an existing integration is left alone.
 */
export type SeedIntegrationsResult = { created: number; runs: number; failed: number };

const iso = (ms: number): string => new Date(ms).toISOString();
const HOUR_MS = 3_600_000;

const EXISTING = `query SeedIntegrations($org: uuid!) { integrations(where: { organization_id: { _eq: $org } }) { id name } }`;
const INSERT = `mutation SeedInsertIntegration($object: integrations_insert_input!) { insert_integrations_one(object: $object) { id } }`;
const SET_CONFIG = `
  mutation SeedIntegrationConfig($id: uuid!, $config: jsonb!) { update_integrations_by_pk(pk_columns: { id: $id }, _set: { config: $config }) { id } }
`;
const SET_SECRET = `mutation SeedIntegrationSecret($id: uuid!, $secret: String!) { update_integrations_by_pk(pk_columns: { id: $id }, _set: { secret: $secret }) { id } }`;
const REQUEST = `
  mutation SeedRequestSync($org: uuid!, $id: uuid!, $trigger: String!, $actor: uuid) {
    request_integration_sync(args: { p_org: $org, p_integration: $id, p_trigger: $trigger, p_actor: $actor }) { id }
  }
`;
const RUN = `query SeedSyncRun($id: uuid!) { integration_sync_runs_by_pk(id: $id) { status started_at finished_at } }`;
const BACKDATE = `
  mutation SeedBackdateSync($id: uuid!, $started: timestamptz!, $finished: timestamptz!) {
    update_integration_sync_runs_by_pk(pk_columns: { id: $id }, _set: { started_at: $started, finished_at: $finished, created_at: $started }) { id }
  }
`;
const LAST_SYNC = `
  mutation SeedLastSync($id: uuid!, $at: timestamptz!) { update_integrations_by_pk(pk_columns: { id: $id }, _set: { last_sync_at: $at }) { id } }
`;

type Ctx = { ctx: SeedContext; org: string; actor: string };
type RunState = { status: string; started_at: string; finished_at: string | null };

/** One sync run through the real job; back-dated to `at` unless null. Returns the end status. */
async function syncRun(c: Ctx, integration: string, trigger: 'manual' | 'schedule', at: number | null): Promise<string> {
  const { ctx, org } = c;
  const { request_integration_sync: rows } = await ctx.admin.request<{ request_integration_sync: { id: string }[] }>(REQUEST, {
    org, id: integration, trigger, actor: trigger === 'manual' ? c.actor : null,
  });
  const id = rows[0]?.id;
  if (!id) throw new Error('seed: sync run not created');
  await runSync(id, { env: ctx.env, admin: ctx.admin, storage: ctx.storage });
  const run = await waitFor(
    async () => (await ctx.admin.request<{ integration_sync_runs_by_pk: RunState | null }>(RUN, { id })).integration_sync_runs_by_pk,
    (r) => r !== null && r.status !== 'running',
    120_000,
    `sync run ${id}`,
  );
  if (!run) throw new Error(`seed: sync run ${id} vanished`);
  if (at !== null) {
    const took = Math.max(800, Date.parse(run.finished_at ?? run.started_at) - Date.parse(run.started_at));
    await ctx.admin.request(BACKDATE, { id, started: iso(at), finished: iso(at + took) });
    await ctx.admin.request(LAST_SYNC, { id: integration, at: iso(at) });
  }
  return run.status;
}

async function fixture(ctx: SeedContext, org: string, version: keyof typeof HR_FIXTURES): Promise<string> {
  const { id } = await ctx.storage.upload({
    bucketId: org,
    name: `workday-employees-${version}.csv`,
    mimeType: 'text/csv',
    data: HR_FIXTURES[version],
    metadata: { kind: 'integration_fixture' },
  });
  return id;
}

async function seedHr(c: Ctx, owner: HasuraClient, timezone: string): Promise<string[]> {
  const spec = INTEGRATIONS.hr;
  const files = { v1: await fixture(c.ctx, c.org, 'v1'), v2: await fixture(c.ctx, c.org, 'v2') };
  const base = { external_id_field: HR_EXTERNAL_ID_FIELD };
  const { insert_integrations_one: row } = await owner.request<{ insert_integrations_one: { id: string } }>(INSERT, {
    object: {
      name: spec.name, description: spec.description, kind: spec.kind, provider: spec.provider, direction: spec.direction,
      config: { ...base, fixture_file_id: files.v1 }, field_mapping: HR_FIELD_MAPPING,
    },
  });
  const statuses: string[] = [];
  for (const [i, run] of HR_RUNS.entries()) {
    await c.ctx.admin.request(SET_CONFIG, { id: row.id, config: { ...base, fixture_file_id: files[run.fixture] } });
    // The initial import was started by hand; later runs are the daily schedule.
    statuses.push(await syncRun(c, row.id, i === 0 ? 'manual' : 'schedule', localAt(c.ctx.now, timezone, run.daysAgo, 2 * 60)));
  }
  await c.ctx.admin.request(SET_CONFIG, { id: row.id, config: { ...base, fixture_file_id: files.v2, ...spec.schedule } });
  return statuses;
}

async function seedSiem(c: Ctx, owner: HasuraClient): Promise<string[]> {
  const spec = INTEGRATIONS.siem;
  const config = { endpoint: spec.endpoint, index: 'itap_security' };
  const { insert_integrations_one: row } = await owner.request<{ insert_integrations_one: { id: string } }>(INSERT, {
    object: { name: spec.name, description: spec.description, kind: spec.kind, provider: spec.provider, direction: spec.direction, config },
  });
  const key = c.ctx.env.AUTH_KEY_ENCRYPTION_KEY;
  if (key) {
    // A random demo token, stored only encrypted (AAD = integration id), never printed.
    await c.ctx.admin.request(SET_SECRET, { id: row.id, secret: encryptSecret(serverKeys(key), randomBytes(18).toString('base64url'), row.id) });
  }
  const statuses: string[] = [];
  const top = Math.floor(c.ctx.now.getTime() / HOUR_MS) * HOUR_MS;
  for (const hours of SIEM_RUN_HOURS_AGO) statuses.push(await syncRun(c, row.id, 'schedule', top - hours * HOUR_MS + 4_000));
  await c.ctx.admin.request(SET_CONFIG, { id: row.id, config: { ...config, ...spec.schedule } });
  return statuses;
}

async function seedBms(c: Ctx, owner: HasuraClient): Promise<string[]> {
  const spec = INTEGRATIONS.bms;
  const config = { endpoint: spec.endpoint };
  const { insert_integrations_one: row } = await owner.request<{ insert_integrations_one: { id: string } }>(INSERT, {
    object: { name: spec.name, description: spec.description, kind: spec.kind, provider: spec.provider, direction: spec.direction, config },
  });
  const statuses = [await syncRun(c, row.id, 'manual', c.ctx.now.getTime() - BMS_OK_HOURS_AGO * HOUR_MS)];
  // The gateway goes down: the stub transport fails every run from now on (demo of the failure path).
  await c.ctx.admin.request(SET_CONFIG, { id: row.id, config: { ...config, simulate_error: spec.failure } });
  for (let i = 0; i < BMS_FAILED_RUNS; i += 1) statuses.push(await syncRun(c, row.id, 'manual', null));
  return statuses;
}

export async function seedIntegrations(
  ctx: SeedContext,
  args: { org: string; owner: HasuraClient; ownerId: string; timezone: string },
): Promise<SeedIntegrationsResult> {
  const { integrations } = await ctx.admin.request<{ integrations: { name: string }[] }>(EXISTING, { org: args.org });
  const names = new Set(integrations.map((i) => i.name));
  const c: Ctx = { ctx, org: args.org, actor: args.ownerId };
  const statuses: string[] = [];
  let created = 0;
  const steps: [string, () => Promise<string[]>][] = [
    [INTEGRATIONS.hr.name, () => seedHr(c, args.owner, args.timezone)],
    [INTEGRATIONS.siem.name, () => seedSiem(c, args.owner)],
    [INTEGRATIONS.bms.name, () => seedBms(c, args.owner)],
  ];
  for (const [name, run] of steps) {
    if (names.has(name)) continue;
    statuses.push(...(await run()));
    created += 1;
  }
  return { created, runs: statuses.length, failed: statuses.filter((s) => s === 'failed').length };
}
