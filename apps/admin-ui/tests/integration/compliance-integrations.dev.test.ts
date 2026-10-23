import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { EXPORT_DEFINITION_RESOURCE, EXPORT_JOB_RESOURCE, INTEGRATION_RESOURCE } from '../../src/data/resource-names';
import { FILES_BINDING } from '../../src/fields/open-file';
import { ownedByOther } from '../../src/modules/compliance/export-job';
import { COMPLIANCE_BINDING } from '../../src/modules/compliance/retention-policy-ops';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, NOVA_ADMIN_EMAIL, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage } from '../support/pagination';

/**
 * Integrations and exports of Nova through the console's operations, as `org_admin`:
 * - a THROWAWAY integration gets a secret (stored encrypted, never selectable, only `has_secret`
 *   reads back) which is then cleared; its schedule is set and removed keeping its other settings;
 *   a paused one refuses Run sync (mapped);
 * - the seeded Workday HR integration syncs by hand through the real job: its fixture was applied
 *   already (the daily schedule re-applies it with no change), so the run reads its records and
 *   writes nothing; the run is removed and the integration's last sync restored afterwards;
 * - an export definition is created and run; the job writes a file the owner opens through the
 *   audited `open_file`, while the second administrator (nova.admin) is refused both the file and a
 *   run (Review Focus 4).
 * Cleanup with the admin secret: the run, the throwaway integration, the definition and its jobs, the
 * export file (queued for deletion) and the audit rows all this wrote.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'compliance-integrations-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };
const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext => ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

type Row = Record<string, unknown>;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const SECRET = `test-secret-not-real-${Date.now()}`;

describe.skipIf(!DEV_STACK_ENABLED)('integrations and exports against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let other: DataProvider;
  let token: () => Promise<string | null>;
  let organization = '';
  let me = '';
  let novaAdmin = '';
  let throwaway = '';
  let workday: { id: string; last_sync_at: string | null; status: string; last_error: string | null } | null = null;
  const runs: string[] = [];
  const definitions: string[] = [];
  const files: string[] = [];

  const customOf =
    (p: () => DataProvider) =>
    async (kind: 'mutations' | 'queries', binding: string, operation: string, input: Row): Promise<unknown> => {
      const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: binding, operation, input };
      return kind === 'mutations'
        ? p().mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
        : p().queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
    };
  const custom = customOf(() => provider);
  const mutate = (resource: string, input: Row) =>
    provider.mutations?.[input.kind as 'createOne']?.(
      createMutationDescriptor({ ...IDENTITY, ref: { namespace: 'default', id: resource }, resource, idField: 'id', ...input } as never) as never,
      mutationContext(),
    ) as Promise<{ record: Row }>;
  const one = async (resource: string, id: string): Promise<Row> =>
    (
      (await provider.queries?.one?.(
        createQueryDescriptor({ ...IDENTITY, kind: 'one', ref: { namespace: 'default', id: resource }, resource, id } as never) as never,
        queryContext(),
      )) as { data: Row }
    ).data;
  const sql = async (statement: string): Promise<string[][]> => {
    const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
      body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql: statement } }),
    });
    expect(response.ok, await response.clone().text()).toBe(true);
    return ((await response.json()) as { result?: string[][] }).result ?? [];
  };
  const graphql = async (query: string, variables: Row = {}): Promise<{ data?: Row; errors?: unknown[] }> => {
    const response = await fetch(DEV_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ query, variables }),
    });
    return (await response.json()) as { data?: Row; errors?: unknown[] };
  };
  const refused = async (promise: Promise<unknown>): Promise<unknown> => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).not.toBeNull();
    return error;
  };
  /** Reads a row until `done` holds (bounded). */
  const until = async (read: () => Promise<Row>, done: (row: Row) => boolean, label: string, timeoutMs = 120_000): Promise<Row> => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const row = await read();
      if (done(row)) return row;
      if (Date.now() > end) throw new Error(`${label} still ${String(row.status)}`);
      await pause(1500);
    }
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    token = () => auth.getToken();
    provider = createItapHasuraProvider(token, DEV_GRAPHQL);
    const second = await signInDev(NOVA_ADMIN_EMAIL, NOVA_NAME);
    other = createItapHasuraProvider(() => second.getToken(), DEV_GRAPHQL);
    me = String((await auth.getIdentity({} as never))?.id ?? '');
    novaAdmin = String((await second.getIdentity({} as never))?.id ?? '');
    const { data } = await graphql(`{ organizations { id name } integrations(where: { kind: { _eq: hr } }, order_by: { code: asc }, limit: 1) { id last_sync_at status last_error } }`);
    organization = String((data?.organizations as { id: string; name: string }[]).find((o) => o.name === NOVA_NAME)?.id ?? '');
    workday = (data?.integrations as NonNullable<typeof workday>[])[0] ?? null;
    expect(organization).not.toBe('');
    expect(me).not.toBe('');
    expect(novaAdmin).not.toBe(me);
  }, 60_000);

  afterAll(async () => {
    const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');
    const statements = ["select set_config('itap.retention_context', 'on', true)"];
    if (runs.length > 0) statements.push(`delete from itap.integration_sync_runs where id in (${quoted(runs)})`);
    if (workday !== null) {
      const last = workday.last_sync_at === null ? 'null' : `'${workday.last_sync_at}'`;
      statements.push(`update itap.integrations set last_sync_at = ${last} where id = '${workday.id}'`);
    }
    if (throwaway !== '') {
      statements.push(`delete from itap.integrations where id = '${throwaway}'`);
      statements.push(`delete from itap.audit_log where entity = 'integrations' and entity_id = '${throwaway}'`);
    }
    if (definitions.length > 0) {
      statements.push(
        `delete from itap.audit_log where (entity = 'export_definitions' and entity_id in (${quoted(definitions)})) or (entity = 'export_jobs' and changes ->> 'definition_id' in (${quoted(definitions)}))`,
      );
      statements.push(`delete from itap.export_jobs where definition_id in (${quoted(definitions)})`);
      statements.push(`delete from itap.export_definitions where id in (${quoted(definitions)})`);
    }
    if (files.length > 0) {
      statements.push(`delete from itap.audit_log where entity_id in (${quoted(files)})`);
      statements.push(`select itap.enqueue_unused_files('${organization}', array[${quoted(files)}]::uuid[], 'test:compliance-integrations')`);
    }
    await sql(statements.join(';\n'));
  }, 60_000);

  it('should store a secret write-only, then clear it', async () => {
    const created = await mutate(INTEGRATION_RESOURCE, {
      kind: 'createOne',
      input: { name: `Dev test connector ${Date.now()}`, kind: 'custom', provider: 'Dev test', direction: 'outbound', status: 'active', config: { endpoint: 'https://example.test/hook' }, field_mapping: {} },
    });
    throwaway = String(created.record.id);
    expect((await one(INTEGRATION_RESOURCE, throwaway)).has_secret).toBe(false);

    const set = (await custom('mutations', COMPLIANCE_BINDING, 'setIntegrationSecret', { integrationId: throwaway, secret: SECRET })) as Row;
    expect(set).toEqual({ integration_id: throwaway, has_secret: true });
    const read = await one(INTEGRATION_RESOURCE, throwaway);
    expect(read.has_secret).toBe(true);
    expect(JSON.stringify(read)).not.toContain(SECRET);
    // The column is not selectable for the role, and the database holds ciphertext only.
    expect((await graphql(`query($id: uuid!) { integrations_by_pk(id: $id) { secret } }`, { id: throwaway })).errors).toBeDefined();
    const [, stored] = await sql(`select secret from itap.integrations where id = '${throwaway}'`);
    expect(stored?.[0]).toMatch(/^v2:/);
    expect(stored?.[0]).not.toContain(SECRET);
    const [, audited] = await sql(`select count(*) from itap.audit_log where entity_id = '${throwaway}' and changes::text like '%${SECRET}%'`);
    expect(audited?.[0]).toBe('0');

    const cleared = (await custom('mutations', COMPLIANCE_BINDING, 'setIntegrationSecret', { integrationId: throwaway, secret: null })) as Row;
    expect(cleared.has_secret).toBe(false);
    expect((await one(INTEGRATION_RESOURCE, throwaway)).has_secret).toBe(false);
  }, 60_000);

  it('should set and remove a schedule keeping the other settings, and refuse a paused sync', async () => {
    await custom('mutations', COMPLIANCE_BINDING, 'setIntegrationSchedule', { integrationId: throwaway, cron: '0 3 * * *', timezone: 'Europe/Moscow' });
    expect((await one(INTEGRATION_RESOURCE, throwaway)).config).toEqual({ endpoint: 'https://example.test/hook', schedule_cron: '0 3 * * *', schedule_timezone: 'Europe/Moscow' });
    // A setting changed after the page was read is kept: the flow writes only the schedule keys.
    await mutate(INTEGRATION_RESOURCE, { kind: 'updateOne', id: throwaway, input: { config: { endpoint: 'https://example.test/other', schedule_cron: '0 3 * * *', schedule_timezone: 'Europe/Moscow' } } });
    await custom('mutations', COMPLIANCE_BINDING, 'setIntegrationSchedule', { integrationId: throwaway, cron: null, timezone: null });
    expect((await one(INTEGRATION_RESOURCE, throwaway)).config).toEqual({ endpoint: 'https://example.test/other' });

    await mutate(INTEGRATION_RESOURCE, { kind: 'updateOne', id: throwaway, input: { status: 'paused' } });
    expect(await refused(custom('mutations', COMPLIANCE_BINDING, 'runIntegrationSync', { integrationId: throwaway }))).toMatchObject({
      kind: 'validation',
      code: 'integration_paused',
    });
  }, 60_000);

  it('should run the HR fixture sync and log a run that writes nothing new', async ({ skip }) => {
    expect(workday).not.toBeNull();
    expect(workday?.status, 'the seeded HR integration must be active to sync').toBe('active');
    const id = String(workday?.id);
    // A scheduled sync may be running right now: retry for a while, then skip with the reason.
    let started: Row | null = null;
    for (let attempt = 0; started === null; attempt += 1) {
      const answer = await custom('mutations', COMPLIANCE_BINDING, 'runIntegrationSync', { integrationId: id }).then(
        (row) => ({ row: row as Row }),
        (error: unknown) => ({ error }),
      );
      if ('row' in answer) started = answer.row;
      else if ((answer.error as { code?: unknown }).code !== 'integration_sync_running') throw answer.error;
      else if (attempt >= 20) skip('the seeded HR integration is still syncing (scheduled run); nothing was asserted');
      else await pause(3000);
    }
    runs.push(String(started.run_id));
    expect(started.status).toBe('running');
    const status = async () => (await custom('queries', COMPLIANCE_BINDING, 'jobStatus', { job: 'sync_run', id: String(started.run_id) })) as Row;
    await until(status, (row) => row.status !== 'running', 'sync run');
    const { data } = (await provider.queries?.list?.(
      createQueryDescriptor({
        ...IDENTITY,
        kind: 'list',
        ref: { namespace: 'default', id: 'integration_sync_run' },
        resource: 'integration_sync_run',
        filter: { field: 'integration_id', op: 'eq', value: id },
        sort: [{ field: 'started_at', direction: 'desc' }],
        pagination: offsetPage(1, 5),
      } as never) as never,
      queryContext(),
    )) as { data: Row[] };
    const run = data.find((row) => row.id === started.run_id);
    expect(run).toMatchObject({ status: 'succeeded', trigger: 'manual', created_count: 0, updated_count: 0, deactivated_count: 0 });
    expect(Number(run?.records_in)).toBeGreaterThan(0);
  }, 180_000);

  it('should export to a file only its owner opens (Review Focus 4)', async () => {
    const created = await mutate(EXPORT_DEFINITION_RESOURCE, {
      kind: 'createOne',
      input: { name: `Dev test export ${Date.now()}`, entity: 'profiles', format: 'csv', filters: { status: { _eq: 'active' } }, mode: 'full', max_rows: 5, timezone: 'UTC', is_active: true },
    });
    const definition = String(created.record.id);
    definitions.push(definition);
    expect((await one(EXPORT_DEFINITION_RESOURCE, definition)).owner_id).toBe(me);

    const queued = (await custom('mutations', COMPLIANCE_BINDING, 'runExport', { definitionId: definition })) as Row;
    const status = async () => (await custom('queries', COMPLIANCE_BINDING, 'jobStatus', { job: 'export_job', id: String(queued.id) })) as Row;
    await until(status, (row) => row.status === 'completed' || row.status === 'failed', 'export job');
    const job = await one(EXPORT_JOB_RESOURCE, String(queued.id));
    expect(job).toMatchObject({ status: 'completed', requested_by: me, truncated: true, row_count: 5 });
    files.push(String(job.file_id));

    const opened = (await custom('mutations', FILES_BINDING, 'openFile', { file_id: job.file_id })) as { url: string };
    const download = await fetch(opened.url);
    expect(download.status).toBe(200);
    expect((await download.text()).split('\n').filter((line) => line.trim() !== '').length).toBe(6);

    // The second administrator sees the job, gets no link (the rule) and is refused by the server.
    expect(ownedByOther({ record: job, user: { id: novaAdmin } } as never, 'requested_by')).toBe(true);
    expect(ownedByOther({ record: job, user: { id: me } } as never, 'requested_by')).toBe(false);
    const asOther = customOf(() => other);
    await refused(asOther('mutations', FILES_BINDING, 'openFile', { file_id: job.file_id }));
    await refused(asOther('mutations', COMPLIANCE_BINDING, 'runExport', { definitionId: definition }));
  }, 180_000);
});
