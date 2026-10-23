import {
  type DataProvider,
  type MutationContext,
  type QueryContext,
  createMutationDescriptor,
  createQueryDescriptor,
} from '@burojs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createItapHasuraProvider } from '../../src/data/provider';
import { BULK_JOB_RESOURCE, BULK_JOB_ROW_RESOURCE } from '../../src/data/resource-names';
import { BULK_INPUT_KIND } from '../../src/fields/bulk-fields';
import { type StorageTarget, presignStorageFile, uploadStorageFile } from '../../src/fields/storage-client';
import { BULK_JOBS_BINDING, type BulkJobProgress, bulkJobProgress } from '../../src/modules/search/bulk-job-ops';
import { newBulkJobOf, notProcessed } from '../../src/modules/search/bulk-job-shape';
import { ADMIN_EMAIL, DEV_GRAPHQL, DEV_STACK_ENABLED, DEV_STORAGE, NOVA_NAME, devAdminSecret, signInDev } from '../support/dev-stack';
import { offsetPage, type TestQueryInput } from '../support/pagination';

/**
 * Bulk jobs of Nova against the dev stack, as `org_admin`, through the console's own operations and
 * the real `run_bulk_job` worker: a profile import of one valid and one invalid row ends partly
 * failed with the failed row's reason, the created profile, counts that add up and a result file
 * that opens (Review Focus 3); a large dry run cancelled while queued or running ends cancelled and
 * stops moving (Review Focus 4). Cleanup with the admin secret: the imported profile, the jobs (their
 * rows go with them) and the uploaded and result files.
 */

const IDENTITY = { providerId: 'hasura', sessionKey: 'bulk-jobs-dev-test', scopeKey: null, bindingRevision: '1' } as const;
const session = { sessionKey: IDENTITY.sessionKey, scopeKey: null, generation: 1 };

type Row = Record<string, unknown>;

const mutationContext = (): MutationContext => ({
  signal: new AbortController().signal,
  requestContext: {},
  session,
  providerServiceKey: 'hasura',
  idempotencyKey: crypto.randomUUID(),
});
const queryContext = (): QueryContext => ({ signal: new AbortController().signal, requestContext: {}, session, providerServiceKey: 'hasura' }) as QueryContext;

const runSql = async (sql: string): Promise<Row> => {
  const response = await fetch(DEV_GRAPHQL.replace('/v1/graphql', '/v2/query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hasura-admin-secret': devAdminSecret() },
    body: JSON.stringify({ type: 'run_sql', args: { source: 'default', sql } }),
  });
  expect(response.ok).toBe(true);
  return (await response.json()) as Row;
};

const TERMINAL = new Set(['completed', 'partial', 'failed', 'cancelled']);
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const quoted = (ids: readonly string[]) => ids.map((id) => `'${id}'`).join(', ');

describe.skipIf(!DEV_STACK_ENABLED)('bulk jobs against the dev stack (Nova Tower)', () => {
  let provider: DataProvider;
  let target: StorageTarget;
  let bucket = '';
  const jobs: string[] = [];
  const files: string[] = [];
  const profiles: string[] = [];

  const custom = (kind: 'mutation' | 'query', operation: string, input: Row) => {
    const descriptor = { ...IDENTITY, kind: 'custom', ref: { namespace: 'default', id: operation }, resource: BULK_JOBS_BINDING, operation, input };
    return kind === 'mutation'
      ? provider.mutations?.custom?.(createMutationDescriptor(descriptor as never) as never, mutationContext())
      : provider.queries?.custom?.(createQueryDescriptor(descriptor as never) as never, queryContext());
  };
  const list = async (resource: string, input: TestQueryInput): Promise<Row[]> =>
    (
      (await provider.queries?.list?.(
        createQueryDescriptor({ ...IDENTITY, ref: { namespace: 'default', id: resource }, resource, kind: 'list', ...input } as never) as never,
        queryContext(),
      )) as { data: Row[] }
    ).data;
  const progress = async (jobId: string): Promise<BulkJobProgress> => bulkJobProgress.parse(await custom('query', 'bulkJobProgress', { jobId }));

  /** Uploads `csv` as a `bulk_input` file and inserts a job of `kind` reading it. */
  const start = async (kind: 'profile_import', csv: string, values: Row): Promise<string> => {
    const { id: input } = await uploadStorageFile(new File([csv], 'dev-test.csv', { type: 'text/csv' }), { bucket, kind: BULK_INPUT_KIND }, target);
    files.push(input);
    const created = (await custom('mutation', 'createBulkJob', { ...newBulkJobOf(kind, { ...values, input_file_id: input }) })) as Row;
    jobs.push(String(created.id));
    expect(created).toMatchObject({ status: 'queued' });
    expect(String(created.code)).toMatch(/^BULK-\d{5}$/u);
    return String(created.id);
  };

  /** Reads the job until it ends (bounded). */
  const finished = async (jobId: string, ms = 60_000): Promise<BulkJobProgress> => {
    const until = Date.now() + ms;
    for (;;) {
      const state = await progress(jobId);
      if (TERMINAL.has(state.status) || Date.now() > until) return state;
      await sleep(1000);
    }
  };

  beforeAll(async () => {
    const auth = await signInDev(ADMIN_EMAIL, NOVA_NAME);
    provider = createItapHasuraProvider(() => auth.getToken(), DEV_GRAPHQL);
    target = { base: DEV_STORAGE, getToken: () => auth.getToken() };
    bucket = (await auth.getIdentity({} as never))?.organizationId ?? '';
    expect(bucket).not.toBe('');
  }, 60_000);

  afterAll(async () => {
    if (profiles.length > 0) await runSql(`delete from itap.profiles where id in (${quoted(profiles)})`);
    if (jobs.length > 0) {
      const { result } = (await runSql(`select result_file_id from itap.bulk_jobs where id in (${quoted(jobs)}) and result_file_id is not null`)) as {
        result: string[][];
      };
      files.push(...result.slice(1).map(([id]) => String(id)));
      await runSql(`delete from itap.bulk_jobs where id in (${quoted(jobs)})`);
    }
    for (const id of files) {
      await fetch(`${DEV_STORAGE}/v1/files/${id}`, { method: 'DELETE', headers: { 'x-hasura-admin-secret': devAdminSecret() } }).catch(() => undefined);
    }
  }, 60_000);

  it('should import the valid row, fail the invalid one with its reason, and add up (Review Focus 3)', async () => {
    const stamp = Date.now();
    const csv = `first_name,last_name,email\r\nDevtest,Bulk${stamp},devtest.bulk.${stamp}@example.com\r\nDevtest,,\r\n`;
    const jobId = await start('profile_import', csv, { dry_run: false });
    const state = await finished(jobId);
    expect(state).toMatchObject({ status: 'partial', total: 2, processed: 2, succeeded: 1, failed: 1, skipped: 0, error: null });
    expect(state.succeeded + state.failed + state.skipped + notProcessed(state)).toBe(state.total);

    const rows = await list(BULK_JOB_ROW_RESOURCE, {
      pagination: offsetPage(1),
      filter: { field: 'bulk_job_id', op: 'eq', value: jobId },
      sort: [{ field: 'row_no', direction: 'asc' }],
    });
    if (typeof rows[0]?.profile_id === 'string') profiles.push(rows[0].profile_id);
    expect(rows.map((row) => [row.row_no, row.outcome, row.error])).toEqual([
      [1, 'created', null],
      [2, 'failed', 'required:last_name'],
    ]);
    expect(rows[0]?.entity_code).toMatch(/^PROFILE-\d{5}$/u);
    const failed = await list(BULK_JOB_ROW_RESOURCE, {
      pagination: offsetPage(1),
      filter: { and: [{ field: 'bulk_job_id', op: 'eq', value: jobId }, { field: 'outcome', op: 'in', value: ['failed'] }] },
    });
    expect(failed.map((row) => row.row_no)).toEqual([2]);

    const [stored] = await list(BULK_JOB_RESOURCE, { pagination: offsetPage(1), filter: { field: 'id', op: 'eq', value: jobId } });
    expect(stored).toMatchObject({ kind: 'profile_import', status: 'partial', options: { dry_run: false } });
    const { url } = await presignStorageFile(String(stored?.result_file_id), target);
    const result = await (await fetch(url)).text();
    expect(result.split(/\r?\n/u)[0]).toBe('row_no,outcome,entity_id,entity_code,error');
    expect(result).toContain('required:last_name');
  }, 90_000);

  it('should cancel a queued or running job, which then stops moving (Review Focus 4)', async () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `Devtest,Cancel${i}`);
    const jobId = await start('profile_import', `first_name,last_name\r\n${lines.join('\r\n')}\r\n`, { dry_run: true });
    const cancelled = (await custom('mutation', 'cancelBulkJob', { jobId })) as Row;
    expect(cancelled).toMatchObject({ id: jobId, status: 'cancelled' });
    const settled = await progress(jobId);
    await sleep(4000);
    const later = await progress(jobId);
    expect(later.status).toBe('cancelled');
    expect(later.processed).toBe(settled.processed);
    expect(later.processed).toBeLessThan(3000);
    // Cancelling again is refused with a sentence: the job has finished.
    await expect(custom('mutation', 'cancelBulkJob', { jobId })).rejects.toMatchObject({ kind: 'validation', code: 'bulk_job_not_cancellable' });
  }, 60_000);
});
