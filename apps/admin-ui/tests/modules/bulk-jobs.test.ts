import { type DataError, defineDataProvider, defineMutationHandler } from '@burojs/core';
import { answer, runFlow } from '@burojs/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/app/app-definition';
import { BULK_POLL_LIMIT_MS, bulkJobPending } from '../../src/blocks/bulk-job-progress/bulk-job-polling';
import { withActionRefusals } from '../../src/data/action-refusals';
import { BULK_JOB_RESOURCE } from '../../src/data/resource-names';
import { type BulkText, bulkErrorText, bulkOptionLines } from '../../src/fields/bulk-format';
import { bulkSearchCsv } from '../../src/fields/bulk-search-csv';
import bulkTexts from '../../src/i18n/bulk/en';
import { ACTION_REFUSALS } from '../../src/modules';
import { bulkJobCreated } from '../../src/modules/search/bulk-job-flows';
import { BULK_JOBS_BINDING, type BulkJobProgress } from '../../src/modules/search/bulk-job-ops';
import { newBulkJobOf, notProcessed, progressPercent } from '../../src/modules/search/bulk-job-shape';

/**
 * Bulk jobs without the UI: error codes and options in words, the bulk search CSV, the job written
 * per kind, counts that add up (Review Focus 3), the bounded progress polling, Retry offered only
 * when rows failed and Cancel only while the job runs (Review Focus 4), "Check again", and the
 * refusals of the job's writes.
 */

const JOB = '88888888-8888-4888-8888-000000000001';
const INPUT = '77777777-7777-4777-8777-000000000001';
const OWNER = { id: 'user-1', roles: ['org_admin'] };

/** `t` over the English bundle, `{{name}}` filled from params. */
const t: BulkText = (key, params) => {
  const path = key.split('.').slice(1);
  let node: unknown = bulkTexts.console;
  for (const part of path) node = (node as Record<string, unknown>)[part];
  return String(node).replaceAll(/\{\{(\w+)\}\}/gu, (_, name: string) => String(params?.[name] ?? ''));
};

const job = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: JOB,
  code: 'BULK-00004',
  kind: 'profile_import',
  status: 'partial',
  input_file_id: INPUT,
  options: {},
  owner_id: 'user-1',
  ...overrides,
});

beforeAll(async () => {
  await app.ready;
});

describe('codes and options in words', () => {
  it('should read row and job codes as sentences, with their column', () => {
    expect(bulkErrorText('required:last_name', t)).toBe('The “last_name” column is empty; this row needs it.');
    expect(bulkErrorText('company_not_found', t)).toBe('No company of the organization has this name or ID.');
    expect(bulkErrorText('header_missing', t)).toBe('The input file has no header row.');
    expect(bulkErrorText('header_missing:first_name', t)).toBe('The header lacks the “first_name” column this kind of job needs.');
    expect(bulkErrorText('csv_invalid: unterminated quoted field in record 3', t)).toBe(
      'The input file is not a readable CSV file (“unterminated quoted field in record 3”).',
    );
    expect(bulkErrorText('no_face', t)).toBe('No face was found in the photo.');
    expect(bulkErrorText('weird_code', t)).toBe('Refused: weird_code');
    expect(bulkErrorText(null, t)).toBeNull();
    expect(bulkErrorText(' ', t)).toBeNull();
  });

  it('should say what each kind’s options ask for', () => {
    const label = (key: string) => key.toUpperCase();
    expect(bulkOptionLines('profile_import', { dry_run: true }, t, label)).toEqual(['Dry run: every row is checked, nothing is saved.']);
    expect(bulkOptionLines('profile_update', {}, t, label)).toEqual(['Profiles found by: EMPLOYEE_ID', 'Rows are saved as they are read.']);
    expect(bulkOptionLines('bulk_search', { threshold: 0.7, max_results: 3 }, t, label)).toEqual([
      'Similarity threshold: 0.7',
      'Results per photo: up to 3',
    ]);
    expect(bulkOptionLines('bulk_search', {}, t, label)).toEqual(['Similarity threshold: the organization’s default', 'Results per photo: up to 5']);
  });
});

describe('a new job', () => {
  it('should write each kind with its own options', () => {
    expect(newBulkJobOf('profile_import', { input_file_id: INPUT, dry_run: true, update_key: 'email' })).toEqual({
      kind: 'profile_import',
      input_file_id: INPUT,
      options: { dry_run: true },
    });
    expect(newBulkJobOf('profile_update', { input_file_id: INPUT, update_key: 'email' })).toEqual({
      kind: 'profile_update',
      input_file_id: INPUT,
      options: { update_key: 'email', dry_run: false },
    });
    expect(newBulkJobOf('bulk_search', { input_file_id: INPUT, threshold: null, max_results: 7, dry_run: true })).toEqual({
      kind: 'bulk_search',
      input_file_id: INPUT,
      options: { max_results: 7 },
    });
  });

  it('should write the bulk search CSV, quoting labels that need it', () => {
    expect(bulkSearchCsv([{ id: 'a', name: 'x.jpg' }, { id: 'b', name: 'say "hi", ok.png' }])).toBe(
      'image_file_id,label\r\na,x.jpg\r\nb,"say ""hi"", ok.png"\r\n',
    );
  });

  it('should take a job of that kind reading that file for the one sent (Check again)', async () => {
    const lists: unknown[] = [];
    const data = (rows: readonly unknown[]) => ({ list: async (_: unknown, params: unknown) => (lists.push(params), { data: rows }) }) as never;
    expect(await bulkJobCreated({ data: data([]) } as never)).toBe('unknown');
    const flow = await runFlow(app, { resource: BULK_JOB_RESOURCE, action: 'import_profiles' }, {
      user: OWNER,
      mutations: { 'itap:create-bulk-job': [answer({ id: JOB, code: 'BULK-00005', status: 'queued' })] },
    }).open();
    await flow.fill({ input_file_id: INPUT });
    await flow.submit();
    flow.assertOutcome('success');
    expect(flow.submitted[0]?.call).toMatchObject({ input: { kind: 'profile_import', input_file_id: INPUT, options: { dry_run: false } } });
    expect(await bulkJobCreated({ data: data([job()]) } as never)).toBe('applied');
    expect(await bulkJobCreated({ data: data([]) } as never)).toBe('not-applied');
    expect(lists[0]).toMatchObject({
      filter: { and: [{ field: 'input_file_id', op: 'eq', value: INPUT }, { field: 'kind', op: 'eq', value: 'profile_import' }] },
    });
  });
});

describe('counts and progress', () => {
  const counts = { total: 40, processed: 10, succeeded: 9, failed: 1, skipped: 0 };

  it('should count the rows a cancelled job never reached, so the counts add up (Review Focus 3)', () => {
    expect(notProcessed(counts)).toBe(30);
    expect(notProcessed({ ...counts, total: 10 })).toBe(0);
    expect(notProcessed({ ...counts, total: null })).toBe(0);
    expect(progressPercent(counts)).toBe(25);
    expect(progressPercent({ ...counts, total: null })).toBeNull();
    expect(progressPercent({ ...counts, total: 0, processed: 0 })).toBe(100);
  });

  it('should read the job again only while it moves, and not forever', () => {
    const progress = (status: string) => ({ status }) as BulkJobProgress;
    expect(bulkJobPending(progress('running'), null, 0, 1000)).toBe(true);
    expect(bulkJobPending(progress('queued'), null, 0, 1000)).toBe(true);
    expect(bulkJobPending(progress('cancelled'), 'running', 0, 1000)).toBe(false);
    expect(bulkJobPending(undefined, 'running', 0, 1000)).toBe(true);
    expect(bulkJobPending(progress('running'), null, 0, BULK_POLL_LIMIT_MS)).toBe(false);
  });
});

describe('Retry and Cancel (Review Focus 4)', () => {
  const itemFlow = (action: 'retry' | 'cancel', record: Record<string, unknown>) =>
    runFlow(app, { resource: BULK_JOB_RESOURCE, action }, {
      user: OWNER,
      record,
      rows: { [BULK_JOB_RESOURCE]: [record] },
      mutations: {
        'itap:retry-bulk-job': [answer({ id: JOB, code: 'BULK-00004', status: 'queued' })],
        'itap:cancel-bulk-job': [answer({ id: JOB, code: 'BULK-00004', status: 'cancelled' })],
      },
    });

  it('should offer Retry on failed and partly failed jobs only', async () => {
    for (const status of ['failed', 'partial']) {
      const flow = await itemFlow('retry', job({ status })).open();
      await flow.submit();
      await flow.accept(); // the confirmation
      flow.assertOutcome('success');
      expect(flow.submitted[0]?.call).toMatchObject({ input: { jobId: JOB } });
    }
    for (const status of ['queued', 'running', 'completed', 'cancelled']) (await itemFlow('retry', job({ status })).open()).assertUnavailable();
  });

  it('should not retry a job whose input file is gone', async () => {
    (await itemFlow('retry', job({ status: 'failed', input_file_id: null })).open()).assertDisabled(/input file was deleted/u);
  });

  it('should offer Cancel on queued and running jobs only', async () => {
    for (const status of ['queued', 'running']) {
      const flow = await itemFlow('cancel', job({ status })).open();
      await flow.submit();
      await flow.accept(); // the confirmation
      flow.assertOutcome('success');
      expect(flow.submitted[0]?.call).toMatchObject({ input: { jobId: JOB } });
    }
    for (const status of ['completed', 'partial', 'failed', 'cancelled']) (await itemFlow('cancel', job({ status })).open()).assertUnavailable();
  });
});

describe('bulk job refusals', () => {
  const refused = (operation: string, message: string) =>
    withActionRefusals(
      defineDataProvider({
        mutations: {
          custom: defineMutationHandler(async () =>
            Promise.reject({ kind: 'sent', code: 'constraint-violation', message, details: [{ message, extensions: { code: 'constraint-violation' } }] } satisfies DataError),
          ),
        },
      }),
      ACTION_REFUSALS,
    ).mutations?.custom?.({ kind: 'custom', resource: BULK_JOBS_BINDING, operation, input: {} } as never, {} as never);

  it('should read the guard’s codes, the options check and the lifecycle codes as sentences', async () => {
    await expect(refused('createBulkJob', 'Check constraint violation. bulk_input_not_found')).rejects.toMatchObject({
      kind: 'validation',
      code: 'bulk_input_not_found',
    });
    await expect(
      refused('createBulkJob', 'Check constraint violation. new row for relation "bulk_jobs" violates check constraint "bulk_jobs_options_valid"'),
    ).rejects.toMatchObject({ kind: 'validation', code: 'bulk_jobs_options_valid' });
    await expect(refused('cancelBulkJob', 'Check constraint violation. bulk_job_not_cancellable')).rejects.toMatchObject({
      kind: 'validation',
      code: 'bulk_job_not_cancellable',
    });
    await expect(refused('retryBulkJob', 'Check constraint violation. bulk_job_not_retryable')).rejects.toMatchObject({
      kind: 'validation',
      code: 'bulk_job_not_retryable',
    });
  });
});
