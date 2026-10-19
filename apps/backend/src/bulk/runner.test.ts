import { describe, expect, it } from 'vitest';
import { HasuraError, type HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';
import type { BulkDeps, Job } from './ops.js';
import { runBulkJob } from './runner.js';

const ORG = '11111111-1111-1111-1111-111111111111';
const OWNER = '22222222-2222-2222-2222-222222222222';
const JOB = '33333333-3333-3333-3333-333333333333';

type Call = { op: string; variables: Record<string, unknown> };

function job(over: Partial<Job> = {}): Job {
  return {
    id: JOB, code: 'BULK-00001', organization_id: ORG, owner_id: OWNER, kind: 'profile_import', options: {},
    input_file_id: 'file-in', status: 'running', attempts: 1, total: null, processed: 0, result_file_id: null, ...over,
  };
}

function world(csv: string, opts: { claimed?: Job | null; doneRows?: number[]; applyError?: (row: number) => unknown; stopAt?: number } = {}) {
  const calls: Call[] = [];
  const applied: number[] = [];
  const uploads: string[] = [];
  const deleted: string[] = [];
  let progressCount = 0;
  const op = (query: string) => /(?:mutation|query)\s+(\w+)/.exec(query)?.[1] ?? 'unknown';
  const admin: HasuraClient = {
    request: async <T>(query: string, variables: Record<string, unknown> = {}) => {
      const name = op(query);
      calls.push({ op: name, variables });
      const answer = (data: unknown) => data as T;
      switch (name) {
        case 'ClaimBulkJob':
          return answer({ claim_bulk_job: opts.claimed === null ? [] : [opts.claimed ?? job()] });
        case 'BulkInputFile':
          return answer({ file: { id: 'file-in', bucketId: ORG, size: csv.length, isUploaded: true } });
        case 'BulkCustomKeys':
          return answer({ custom_attribute_definitions: [{ key: 'badge' }] });
        case 'BulkLeftoverFiles':
          return answer({ files: [{ id: 'old-upload' }] });
        case 'BulkJobRows':
          return answer({
            bulk_job_rows: (opts.doneRows ?? []).map((row_no) => ({ row_no, outcome: 'created', error: null })),
          });
        case 'BulkJobProgress': {
          progressCount += 1;
          const stopped = opts.stopAt !== undefined && progressCount >= opts.stopAt;
          return answer({ bulk_job_progress: [job({ status: stopped ? 'cancelled' : 'running', attempts: variables.attempt as number })] });
        }
        case 'RecordBulkJobRow':
          applied.push(variables.row as number);
          return answer({ record_bulk_job_row: [{}] });
        case 'CompleteBulkJob':
          return answer({ complete_bulk_job: [{ id: JOB, status: 'completed' }] });
        case 'FailBulkJob':
          return answer({ fail_bulk_job: [{ id: JOB, status: 'failed' }] });
        default:
          throw new Error(`unexpected ${name}`);
      }
    },
  };
  const owner: HasuraClient = {
    request: async <T>(query: string, variables: Record<string, unknown> = {}) => {
      calls.push({ op: op(query), variables });
      const row = variables.row as number;
      const error = opts.applyError?.(row);
      if (error) throw error;
      applied.push(row);
      return { bulk_apply_profile_row: [{ row_no: row, outcome: 'created' }] } as T;
    },
  };
  const storage: StorageClient = {
    presignedUrl: async () => ({ url: '', expiresAt: new Date() }),
    deleteFile: async (id) => {
      deleted.push(id);
    },
    download: async () => Buffer.from(csv, 'utf8'),
    upload: async ({ data }) => {
      uploads.push(data.toString('utf8'));
      return { id: 'result-file' };
    },
  };
  let clock = 0;
  const deps: BulkDeps = {
    admin,
    storage,
    asOwner: () => owner,
    searchAs: () => {
      throw new Error('no search');
    },
    now: () => clock,
  };
  return { deps, calls, applied, uploads, deleted, tick: (ms: number) => (clock += ms) };
}

const rows = (n: number) => ['first_name,last_name', ...Array.from({ length: n }, (_, i) => `F${i + 1},L${i + 1}`)].join('\n');

describe('runBulkJob', () => {
  it('should do nothing when the job cannot be claimed', async () => {
    const w = world(rows(1), { claimed: null });
    expect(await runBulkJob(JOB, w.deps)).toEqual({ job_id: JOB, skipped: 'not_claimed' });
    expect(w.calls.map((c) => c.op)).toEqual(['ClaimBulkJob']);
  });

  it('should set the total first, apply every row as the owner, report progress every 25 rows and complete', async () => {
    const w = world(rows(60));
    expect(await runBulkJob(JOB, w.deps)).toEqual({ job_id: JOB, status: 'completed' });
    expect(w.applied).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    const progress = w.calls.filter((c) => c.op === 'BulkJobProgress').map((c) => [c.variables.total, c.variables.processed]);
    expect(progress).toEqual([[60, null], [null, 25], [null, 50], [null, 60]]);
    expect(w.calls.find((c) => c.op === 'BulkApplyProfileRow')?.variables).toMatchObject({ attempt: 1, data: { first_name: 'F1', last_name: 'L1' } });
    expect(w.deleted).toContain('old-upload');
    expect(w.uploads[0].split('\r\n')[0]).toBe('row_no,outcome,entity_id,entity_code,error');
  });

  it('should resume after processed and skip rows that already succeeded', async () => {
    const w = world(rows(6), { claimed: job({ attempts: 2, processed: 2 }), doneRows: [1, 2, 3] });
    await runBulkJob(JOB, w.deps);
    expect(w.applied).toEqual([4, 5, 6]);
    expect(w.calls.filter((c) => c.op === 'BulkApplyProfileRow').every((c) => c.variables.attempt === 2)).toBe(true);
  });

  it('should fail the job on a header problem before applying any row', async () => {
    const w = world('first_name,last_name,salary\nA,B,1');
    expect(await runBulkJob(JOB, w.deps)).toEqual({ job_id: JOB, status: 'failed', error: 'header_unknown:salary' });
    expect(w.applied).toEqual([]);
    expect(w.calls.find((c) => c.op === 'FailBulkJob')?.variables).toEqual({ id: JOB, attempt: 1, error: 'header_unknown:salary' });
  });

  it('should fail on more than 10,000 records and on malformed CSV', async () => {
    expect(await runBulkJob(JOB, world(rows(10_001)).deps)).toMatchObject({ status: 'failed', error: 'too_many_rows' });
    expect(await runBulkJob(JOB, world('first_name,last_name\n"A,B').deps)).toMatchObject({ status: 'failed', error: expect.stringMatching(/^csv_invalid/) });
  });

  it('should record blank and mismatched records without the owner', async () => {
    const w = world('first_name,last_name\nA,B\n,\nC');
    await runBulkJob(JOB, w.deps);
    const recorded = w.calls.filter((c) => c.op === 'RecordBulkJobRow').map((c) => [c.variables.row, c.variables.outcome, c.variables.error]);
    expect(recorded).toEqual([[2, 'skipped', null], [3, 'failed', 'column_count_mismatch']]);
  });

  it('should stop without failing when the job is cancelled or the owner is gone', async () => {
    const cancelled = world(rows(60), { stopAt: 2 });
    expect(await runBulkJob(JOB, cancelled.deps)).toEqual({ job_id: JOB, stopped: 'cancelled' });
    expect(cancelled.applied).toHaveLength(25);
    expect(cancelled.calls.some((c) => c.op === 'FailBulkJob' || c.op === 'CompleteBulkJob')).toBe(false);

    const inactive = world(rows(5), { applyError: (row) => (row === 3 ? new HasuraError('constraint-error', 'bulk_job_owner_inactive') : undefined) });
    expect(await runBulkJob(JOB, inactive.deps)).toEqual({ job_id: JOB, stopped: 'bulk_job_owner_inactive' });
    expect(inactive.calls.some((c) => c.op === 'FailBulkJob')).toBe(false);
  });

  it('should fail the attempt with the error of an unexpected failure', async () => {
    const w = world(rows(3), { applyError: (row) => (row === 2 ? new Error('network down') : undefined) });
    expect(await runBulkJob(JOB, w.deps)).toEqual({ job_id: JOB, status: 'failed', error: 'network down' });
  });

  it('should report progress after 2 seconds even before 25 rows', async () => {
    const w = world(rows(5));
    const owner = w.deps.asOwner(ORG, OWNER);
    w.deps.asOwner = () => ({
      request: async <T>(q: string, v?: Record<string, unknown>) => {
        w.tick(1500);
        return owner.request<T>(q, v);
      },
    });
    await runBulkJob(JOB, w.deps);
    const progress = w.calls.filter((c) => c.op === 'BulkJobProgress').map((c) => c.variables.processed);
    expect(progress).toEqual([null, 2, 4, 5]);
  });
});
