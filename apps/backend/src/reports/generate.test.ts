import { describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import type { StorageClient } from '../storage/storageClient.js';
import { generateReport } from './generate.js';

const REPORT = '11111111-1111-4111-8111-111111111111';
const ORG = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';

const claimed = { id: REPORT, organization_id: ORG, attempts: 2, format: 'csv', code: 'REPORT-00007' };
const dataset = {
  title: 'Flow',
  code: 'REPORT-00007',
  report_type: 'flow',
  period: { start_date: '2026-10-18', end_date: '2026-10-18', timezone: 'UTC' },
  generated_at: '2026-10-19 07:00',
  summary: [{ label: 'Total transitions', value: 3 }],
  columns: ['From', 'To', 'Count'],
  rows: [['Lobby', 'Zone A', 3]],
  truncated: false,
};

type Calls = { query: string; variables: Record<string, unknown> }[];

function fakeAdmin(overrides: {
  claim?: unknown[];
  complete?: () => unknown;
  compute?: () => unknown;
  fail?: unknown[];
  fileId?: string | null;
  leftovers?: string[];
}) {
  const calls: Calls = [];
  const request = vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });
    if (query.includes('claim_report')) return { claim_report: overrides.claim ?? [claimed] };
    if (query.includes('compute_report')) {
      return overrides.compute ? overrides.compute() : { compute_report: [{ dataset }] };
    }
    if (query.includes('complete_report')) {
      return overrides.complete ? overrides.complete() : { complete_report: [{ id: REPORT, status: 'completed' }] };
    }
    if (query.includes('fail_report')) return { fail_report: overrides.fail ?? [{ id: REPORT, status: 'failed' }] };
    if (query.includes('reports_by_pk')) return { reports_by_pk: { file_id: overrides.fileId ?? null } };
    if (query.includes('ReportLeftoverFiles')) return { files: (overrides.leftovers ?? []).map((id) => ({ id })) };
    throw new Error(`unexpected query ${query}`);
  });
  return { admin: { request } as unknown as HasuraClient, calls };
}

function fakeStorage() {
  const storage = {
    upload: vi.fn(async () => ({ id: 'file-1' })),
    deleteFile: vi.fn(async () => undefined),
    presignedUrl: vi.fn(),
    download: vi.fn(),
  };
  return storage as typeof storage & StorageClient;
}

describe('generateReport', () => {
  it('should skip a report it cannot claim', async () => {
    const { admin, calls } = fakeAdmin({ claim: [] });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, skipped: 'not_claimed' });
    expect(calls).toHaveLength(1);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('should compute, render, upload into the org bucket and complete with the claimed attempt', async () => {
    const { admin, calls } = fakeAdmin({});
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, status: 'completed' });
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({
        bucketId: ORG.toLowerCase(),
        name: 'REPORT-00007.csv',
        mimeType: 'text/csv',
        metadata: { kind: 'report', report_id: REPORT },
      }),
    );
    const complete = calls.find((c) => c.query.includes('complete_report'));
    expect(complete?.variables).toMatchObject({ id: REPORT, attempt: 2, file: 'file-1' });
    expect(complete?.variables.summary).toMatchObject({ row_count: 1, truncated: false, file_name: 'REPORT-00007.csv' });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('should fail the report and remove the uploaded file when completion fails', async () => {
    const { admin, calls } = fakeAdmin({
      complete: () => {
        throw new Error('database said no');
      },
    });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({
      report_id: REPORT,
      status: 'failed',
      error: 'database said no',
    });
    expect(storage.deleteFile).toHaveBeenCalledWith('file-1');
    expect(calls.find((c) => c.query.includes('fail_report'))?.variables).toEqual({
      id: REPORT,
      attempt: 2,
      error: 'database said no',
    });
  });

  it('should fail the report without uploading when the dataset is invalid', async () => {
    const { admin } = fakeAdmin({ compute: () => ({ compute_report: [{ dataset: { title: 1 } }] }) });
    const storage = fakeStorage();
    const result = await generateReport(REPORT, { admin, storage });
    expect(result).toMatchObject({ status: 'failed' });
    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('should delete the file when the attempt was superseded before completion', async () => {
    const { admin } = fakeAdmin({ complete: () => ({ complete_report: [] }) });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, skipped: 'superseded' });
    expect(storage.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('should keep the file when the completion committed but its response was lost', async () => {
    const { admin } = fakeAdmin({
      complete: () => {
        throw new Error('socket hang up');
      },
      fail: [],
      fileId: 'file-1',
    });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, skipped: 'superseded' });
    expect(storage.deleteFile).not.toHaveBeenCalled();
  });

  it('should delete its file when a failure could not be recorded because another attempt owns the report', async () => {
    const { admin } = fakeAdmin({ complete: () => { throw new Error('x'); }, fail: [], fileId: 'other-file' });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, skipped: 'superseded' });
    expect(storage.deleteFile).toHaveBeenCalledWith('file-1');
  });

  it('should sweep files earlier attempts of the report left behind after claiming it', async () => {
    const { admin, calls } = fakeAdmin({ leftovers: ['old-1', 'old-2'] });
    const storage = fakeStorage();
    expect(await generateReport(REPORT, { admin, storage })).toEqual({ report_id: REPORT, status: 'completed' });
    expect(storage.deleteFile.mock.calls.map((c) => (c as unknown[])[0])).toEqual(['old-1', 'old-2']);
    const sweep = calls.find((c) => c.query.includes('ReportLeftoverFiles'));
    expect(sweep?.variables).toMatchObject({ bucket: ORG.toLowerCase(), meta: { report_id: REPORT } });
  });

  it('should propagate a failure to record the failure so the lease reclaims the report', async () => {
    const request = vi.fn(async (query: string) => {
      if (query.includes('claim_report')) return { claim_report: [claimed] };
      throw new Error('hasura down');
    });
    const admin = { request } as unknown as HasuraClient;
    await expect(generateReport(REPORT, { admin, storage: fakeStorage() })).rejects.toThrow('hasura down');
  });
});
