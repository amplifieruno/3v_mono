import { createHasuraClient, type HasuraClient } from '../hasura/client.js';
import type { Env } from '../config/env.js';
import { errorText } from '../reports/generate.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';
import { parseFieldMapping, parseFixture, SyncFailure } from './fixture.js';
import { applyHrFixture, type SyncCounts } from './hr.js';

/**
 * The run_sync job (spec §8.4, slice 10 task 4): claim the run (lease, attempt + 1), then by kind — hr: the fixture
 * file applied to profiles (hr.ts); siem / webhook: stub push of the organization's events created in the window
 * (last sync, run start]; bms: stub occupancy snapshot (area_occupancy rows); erp / custom: an empty stub run. A
 * `config.simulate_error` text fails any kind (demo of the failure path). Success completes the run (integration
 * last_sync_at = run start, error cleared); a failure fails it (integration error + integration_failed event), both
 * fenced by the attempt. When even the failure cannot be recorded the error propagates (Hasura retries; the cron
 * reclaims the run after its lease).
 */

export interface SyncDeps {
  env: Env;
  admin: HasuraClient;
  storage: StorageClient;
}

export type SyncResult =
  | { run_id: string; skipped: 'not_claimed' | 'superseded' }
  | { run_id: string; status: 'succeeded' }
  | { run_id: string; status: 'failed'; error: string };

type Claimed = { id: string; organization_id: string; integration_id: string; attempts: number; started_at: string; fixture_file_id: string | null };
type Integration = {
  id: string;
  code: string;
  kind: string;
  config: Record<string, unknown>;
  field_mapping: unknown;
  last_sync_at: string | null;
};

const CLAIM = `
  mutation ClaimSync($id: uuid!) {
    claim_integration_sync(args: { p_run: $id }) { id organization_id integration_id attempts started_at fixture_file_id }
  }
`;
const INTEGRATION = `
  query SyncIntegration($id: uuid!) { integrations_by_pk(id: $id) { id code kind config field_mapping last_sync_at } }
`;
const COMPLETE = `
  mutation CompleteSync($id: uuid!, $attempt: Int!, $result: jsonb!) {
    complete_integration_sync(args: { p_run: $id, p_attempt: $attempt, p_result: $result }) { id }
  }
`;
const FAIL = `
  mutation FailSync($id: uuid!, $attempt: Int!, $error: String!, $result: jsonb!) {
    fail_integration_sync(args: { p_run: $id, p_attempt: $attempt, p_error: $error, p_result: $result }) { id }
  }
`;
const RENEW = `
  mutation RenewSyncLease($id: uuid!, $attempt: Int!) { renew_integration_sync_lease(args: { p_run: $id, p_attempt: $attempt }) { id } }
`;
const EVENTS_SINCE = `
  query SiemWindow($org: uuid!, $after: timestamptz!, $until: timestamptz!) {
    events_aggregate(where: { organization_id: { _eq: $org }, created_at: { _gt: $after, _lte: $until } }) { aggregate { count } }
  }
`;
const OCCUPANCY = `
  query BmsSnapshot($org: uuid!) { area_occupancy_aggregate(where: { organization_id: { _eq: $org } }) { aggregate { count } } }
`;

const empty = (): SyncCounts => ({
  records_in: 0, records_out: 0, created: 0, updated: 0, deactivated: 0, skipped: 0, skipped_suppressed: 0, skipped_restricted: 0,
  errors: [],
});
const DAY_MS = 86_400_000;

async function aggregateCount(admin: HasuraClient, query: string, key: string, variables: Record<string, unknown>): Promise<number> {
  const data = await admin.request<Record<string, { aggregate: { count: number } }>>(query, variables);
  return data[key]?.aggregate.count ?? 0;
}

async function runHr(run: Claimed, i: Integration, deps: SyncDeps): Promise<SyncCounts> {
  if (!run.fixture_file_id) throw new SyncFailure('fixture_not_found');
  let data: Buffer;
  try {
    data = await deps.storage.download(run.fixture_file_id);
  } catch (error: unknown) {
    if (error instanceof StorageError && error.status === 404) throw new SyncFailure('fixture_not_found');
    throw error;
  }
  const mapping = parseFieldMapping(i.field_mapping);
  const field = i.config.external_id_field;
  return applyHrFixture({
    organizationId: run.organization_id,
    integrationId: i.id,
    records: parseFixture(data),
    mapping,
    externalIdField: typeof field === 'string' && field.trim() !== '' ? field.trim() : 'external_id',
    reader: deps.admin,
    renew: async () =>
      (await deps.admin.request<{ renew_integration_sync_lease: unknown[] }>(RENEW, { id: run.id, attempt: run.attempts }))
        .renew_integration_sync_lease.length > 0,
    writer: createHasuraClient(
      deps.env,
      { role: 'admin', organizationId: run.organization_id },
      { sessionVariables: { 'x-hasura-audit-reason': `integration:${i.code}` } },
    ),
  });
}

async function runKind(run: Claimed, i: Integration, deps: SyncDeps): Promise<SyncCounts> {
  const simulated = i.config.simulate_error;
  if (typeof simulated === 'string' && simulated.trim() !== '') throw new SyncFailure(simulated.trim().slice(0, 200));
  const counts = empty();
  switch (i.kind) {
    case 'hr':
      return runHr(run, i, deps);
    case 'siem':
    case 'webhook': {
      const after = i.last_sync_at ?? new Date(Date.parse(run.started_at) - DAY_MS).toISOString();
      counts.records_out = await aggregateCount(deps.admin, EVENTS_SINCE, 'events_aggregate', {
        org: run.organization_id,
        after,
        until: run.started_at,
      });
      return counts;
    }
    case 'bms':
      counts.records_in = await aggregateCount(deps.admin, OCCUPANCY, 'area_occupancy_aggregate', { org: run.organization_id });
      return counts;
    default:
      return counts;
  }
}

export async function runSync(id: string, deps: SyncDeps): Promise<SyncResult> {
  const { claim_integration_sync: rows } = await deps.admin.request<{ claim_integration_sync: Claimed[] }>(CLAIM, { id });
  const run = rows[0];
  if (!run) return { run_id: id, skipped: 'not_claimed' };
  const attempt = run.attempts;
  try {
    const { integrations_by_pk: integration } = await deps.admin.request<{ integrations_by_pk: Integration | null }>(INTEGRATION, {
      id: run.integration_id,
    });
    if (!integration) throw new SyncFailure('integration_not_found');
    const counts = await runKind(run, integration, deps);
    const { complete_integration_sync: done } = await deps.admin.request<{ complete_integration_sync: unknown[] }>(COMPLETE, {
      id,
      attempt,
      result: counts,
    });
    return done.length === 0 ? { run_id: id, skipped: 'superseded' } : { run_id: id, status: 'succeeded' };
  } catch (error: unknown) {
    const message = error instanceof SyncFailure ? error.message : errorText(error);
    const { fail_integration_sync: failed } = await deps.admin.request<{ fail_integration_sync: unknown[] }>(FAIL, {
      id,
      attempt,
      error: message,
      result: {},
    });
    return failed.length === 0 ? { run_id: id, skipped: 'superseded' } : { run_id: id, status: 'failed', error: message };
  }
}
