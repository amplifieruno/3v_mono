import { randomUUID } from 'node:crypto';
import type { HasuraClient } from '../../../src/hasura/client.js';
import { runIntegrationSchedules } from '../../../src/integrations/handlers.js';
import { createStorageClient } from '../../../src/storage/storageClient.js';
import { asAdmin, testEnv } from './clients.js';
import { insertOne } from './operations.js';
import { waitFor } from './sending.js';
import { runSqlRows } from './sql.js';

/** Integrations and sync runs (slice 10 task 4). */

export type Integration = {
  id: string;
  code: string;
  kind: string;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  next_sync_at: string | null;
};
export const INTEGRATION_FIELDS = 'id code kind status last_sync_at last_error next_sync_at';

export type SyncRun = {
  id: string;
  integration_id: string;
  trigger: string;
  status: string;
  records_in: number;
  records_out: number;
  created_count: number;
  updated_count: number;
  deactivated_count: number;
  skipped_count: number;
  errors: { row?: number; code: string }[];
  error: string | null;
  attempts: number;
  fixture_file_id: string | null;
  requested_by: string | null;
};
export const RUN_FIELDS = `id integration_id trigger status records_in records_out created_count updated_count deactivated_count
  skipped_count errors error attempts fixture_file_id requested_by`;

export async function createIntegration(a: HasuraClient, object: Record<string, unknown>): Promise<Integration> {
  return insertOne<Integration>(
    a,
    'integrations',
    { name: `Integration ${randomUUID().slice(0, 8)}`, provider: 'Test provider', kind: 'hr', ...object },
    INTEGRATION_FIELDS,
  );
}

export async function integration(id: string): Promise<Integration> {
  const data = await asAdmin().request<{ integrations_by_pk: Integration }>(
    `query($id: uuid!) { integrations_by_pk(id: $id) { ${INTEGRATION_FIELDS} } }`,
    { id },
  );
  return data.integrations_by_pk;
}

/** Uploads an HR fixture (JSON or CSV text) to the organization bucket as kind integration_fixture. */
export async function uploadFixture(org: string, content: string, format: 'json' | 'csv' = 'json'): Promise<string> {
  const { id } = await createStorageClient(testEnv()).upload({
    bucketId: org,
    name: `fixture-${randomUUID().slice(0, 8)}.${format}`,
    mimeType: format === 'json' ? 'application/json' : 'text/csv',
    data: Buffer.from(content, 'utf8'),
    metadata: { kind: 'integration_fixture' },
  });
  return id;
}

/** The action run_integration_sync as the given client. */
export async function requestSync(a: HasuraClient, integrationId: string): Promise<{ run_id: string; status: string }> {
  const data = await a.request<{ run_integration_sync: { run_id: string; status: string } }>(
    `mutation($id: uuid!) { run_integration_sync(integration_id: $id) { run_id status } }`,
    { id: integrationId },
  );
  return data.run_integration_sync;
}

export async function syncRun(id: string): Promise<SyncRun> {
  const data = await asAdmin().request<{ integration_sync_runs_by_pk: SyncRun }>(
    `query($id: uuid!) { integration_sync_runs_by_pk(id: $id) { ${RUN_FIELDS} } }`,
    { id },
  );
  return data.integration_sync_runs_by_pk;
}

/** Waits until the run leaves `running` (the run_sync trigger runs in the backend container). */
export async function settledRun(id: string, timeoutMs = 30000): Promise<SyncRun> {
  return waitFor(() => syncRun(id), (r) => r.status !== 'running', timeoutMs);
}

/** Requests a sync and waits for its outcome. */
export async function syncNow(a: HasuraClient, integrationId: string): Promise<SyncRun> {
  const { run_id: id } = await requestSync(a, integrationId);
  return settledRun(id);
}

export type SyncedProfile = {
  external_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  department: string | null;
  status: string;
};

/** Profiles synced from an integration, by external id. */
export async function syncedProfiles(org: string, integrationId: string): Promise<SyncedProfile[]> {
  const rows = await runSqlRows(
    `select external_id, first_name, last_name, email, department, status from itap.profiles
     where organization_id = '${org}' and source_integration_id = '${integrationId}' order by external_id`,
  );
  return rows.map((r) => ({
    external_id: String(r.external_id),
    first_name: String(r.first_name),
    last_name: String(r.last_name),
    email: r.email === 'NULL' ? null : r.email,
    department: r.department === 'NULL' ? null : r.department,
    status: String(r.status),
  }));
}

/** The run_integration_schedules cron handler in-process, restricted to the given organizations' integrations. */
export async function runScheduleCron(orgIds: string[], scheduledTime: string): Promise<Record<string, unknown>> {
  const admin = asAdmin();
  const scoped: HasuraClient = {
    request: async <T>(query: string, variables?: Record<string, unknown>) => {
      const data = await admin.request<T>(query, variables);
      for (const key of ['integrations', 'due_integration_syncs'] as const) {
        const list = (data as Record<string, { organization_id: string }[] | undefined>)[key];
        if (list) (data as Record<string, unknown>)[key] = list.filter((r) => orgIds.includes(r.organization_id));
      }
      return data;
    },
  };
  const id = randomUUID();
  const result = await runIntegrationSchedules.handle(
    { id, name: 'run_integration_schedules', scheduled_time: scheduledTime, payload: {}, comment: null },
    { env: testEnv(), admin: scoped, idempotencyKey: `run_integration_schedules:${id}` },
  );
  return { ...result };
}
