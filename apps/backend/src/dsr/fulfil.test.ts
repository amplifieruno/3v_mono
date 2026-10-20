import { describe, expect, it, vi } from 'vitest';
import type { HasuraClient } from '../hasura/client.js';
import { StorageError, type StorageClient } from '../storage/storageClient.js';
import { buildExportArchive } from './exportBundle.js';
import { fulfilDsr } from './fulfil.js';

const ID = '11111111-1111-4111-8111-111111111111';
const ORG = 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA';
const claim = (type: string) => ({ id: ID, organization_id: ORG, code: 'DSR-00003', request_type: type, attempts: 2 });
const bundle = { schema: 'itap-dsr-access/1', files: [{ file_id: 'photo-1', path: 'files/photos/photo-1.png' }] };

type Calls = { query: string; variables: Record<string, unknown> }[];

function fakeAdmin(type: string, o: { claim?: unknown[]; step?: () => unknown; complete?: unknown[]; completeError?: string; fail?: unknown[]; owned?: string | null } = {}) {
  const calls: Calls = [];
  const request = vi.fn(async (query: string, variables: Record<string, unknown> = {}) => {
    calls.push({ query, variables });
    if (query.includes('claim_dsr')) return { claim_dsr: o.claim ?? [claim(type)] };
    if (query.includes('DsrLeftoverFiles')) return { files: [{ id: 'old-upload' }] };
    if (query.includes('dsr_bundle')) return { dsr_bundle: [{ bundle }] };
    if (query.includes('complete_dsr_export') && o.completeError) throw new Error(o.completeError);
    if (query.includes('complete_dsr_export')) return { complete_dsr_export: o.complete ?? [{ id: ID, status: 'completed', partial: false }] };
    if (query.includes('fail_dsr')) return { fail_dsr: o.fail ?? [{ id: ID }] };
    if (query.includes('DsrExportFile')) return { data_subject_requests_by_pk: { export_file_id: o.owned ?? null } };
    if (query.includes('claim_file_deletions')) return { claim_file_deletions: [] };
    for (const fn of ['dsr_erase', 'dsr_restrict', 'dsr_await_rectification']) {
      if (query.includes(fn)) return o.step ? o.step() : { [fn]: [{ id: ID, status: fn === 'dsr_await_rectification' ? 'in_progress' : 'completed', partial: true }] };
    }
    throw new Error(`unexpected query ${query}`);
  });
  return { admin: { request } as unknown as HasuraClient, calls };
}

function fakeStorage(download: (id: string) => Promise<Buffer> = async () => Buffer.from('jpeg')) {
  const storage = {
    upload: vi.fn(async () => ({ id: 'zip-1' })),
    deleteFile: vi.fn(async () => undefined),
    presignedUrl: vi.fn(),
    download: vi.fn(download),
  };
  return storage as typeof storage & StorageClient;
}

describe('fulfilDsr', () => {
  it('should skip a request it cannot claim', async () => {
    const { admin, calls } = fakeAdmin('access', { claim: [] });
    expect(await fulfilDsr(ID, { admin, storage: fakeStorage() })).toEqual({ request_id: ID, skipped: 'not_claimed' });
    expect(calls).toHaveLength(1);
  });

  it('should zip the bundle with its files, upload a sensitive dsr_export file and complete with the attempt', async () => {
    const { admin, calls } = fakeAdmin('access');
    const storage = fakeStorage();
    expect(await fulfilDsr(ID, { admin, storage })).toEqual({ request_id: ID, status: 'completed' });
    expect(storage.deleteFile).toHaveBeenCalledWith('old-upload');
    expect(storage.upload).toHaveBeenCalledWith(
      expect.objectContaining({ bucketId: ORG.toLowerCase(), name: 'DSR-00003.zip', mimeType: 'application/zip', metadata: { kind: 'dsr_export', dsr_id: ID } }),
    );
    const complete = calls.find((c) => c.query.includes('complete_dsr_export'));
    expect(complete?.variables).toMatchObject({ id: ID, attempt: 2, file: 'zip-1', summary: { files: 1, missing_files: 0 } });
  });

  it('should delete its upload when a newer attempt owns the request', async () => {
    const { admin } = fakeAdmin('portability', { complete: [] });
    const storage = fakeStorage();
    expect(await fulfilDsr(ID, { admin, storage })).toEqual({ request_id: ID, skipped: 'superseded' });
    expect(storage.deleteFile).toHaveBeenCalledWith('zip-1');
  });

  it('should record a failure with the attempt and remove the upload unless it became the export', async () => {
    const { admin, calls } = fakeAdmin('access', { completeError: 'database down' });
    const storage = fakeStorage();
    expect(await fulfilDsr(ID, { admin, storage })).toEqual({ request_id: ID, status: 'failed', error: 'database down' });
    expect(calls.find((c) => c.query.includes('fail_dsr'))?.variables).toEqual({ id: ID, attempt: 2, error: 'database down' });
    expect(storage.deleteFile).toHaveBeenCalledWith('zip-1');
    // The completion committed but its answer was lost: the file is the request's export and stays.
    const lost = fakeAdmin('access', { completeError: 'socket hang up', fail: [], owned: 'zip-1' });
    const kept = fakeStorage();
    expect(await fulfilDsr(ID, { admin: lost.admin, storage: kept })).toEqual({ request_id: ID, skipped: 'superseded' });
    expect(kept.deleteFile).not.toHaveBeenCalledWith('zip-1');
  });

  it('should run erasure in SQL, then drain the storage deletion queue', async () => {
    const { admin, calls } = fakeAdmin('erasure');
    expect(await fulfilDsr(ID, { admin, storage: fakeStorage() })).toEqual({ request_id: ID, status: 'completed', partial: true });
    expect(calls.map((c) => c.query).some((q) => q.includes('dsr_erase'))).toBe(true);
    expect(calls.map((c) => c.query).some((q) => q.includes('claim_file_deletions'))).toBe(true);
  });

  it('should restrict, and leave rectifications waiting for org_admin', async () => {
    expect(await fulfilDsr(ID, { admin: fakeAdmin('restriction').admin, storage: fakeStorage() })).toEqual({ request_id: ID, status: 'completed' });
    expect(await fulfilDsr(ID, { admin: fakeAdmin('rectification').admin, storage: fakeStorage() })).toEqual({
      request_id: ID,
      status: 'in_progress',
    });
  });

  it('should report superseded when the fenced step or the failure record finds a newer attempt', async () => {
    const stale = fakeAdmin('erasure', { step: () => ({ dsr_erase: [] }) });
    expect(await fulfilDsr(ID, { admin: stale.admin, storage: fakeStorage() })).toEqual({ request_id: ID, skipped: 'superseded' });
    const lost = fakeAdmin('restriction', { step: () => Promise.reject(new Error('deadlock')), fail: [] });
    expect(await fulfilDsr(ID, { admin: lost.admin, storage: fakeStorage() })).toEqual({ request_id: ID, skipped: 'superseded' });
  });
});

describe('buildExportArchive', () => {
  it('should list files missing in storage instead of failing, and fail on other storage errors', async () => {
    const missing = fakeStorage(async () => {
      throw new StorageError('File download failed (404)', 404);
    });
    const archive = await buildExportArchive(bundle, missing);
    expect(archive).toMatchObject({ files: 0, missing: ['photo-1'] });
    expect(archive.data.subarray(0, 4).readUInt32LE(0)).toBe(0x04034b50);
    const broken = fakeStorage(async () => {
      throw new StorageError('File download failed (500)', 500);
    });
    await expect(buildExportArchive(bundle, broken)).rejects.toThrow('500');
    await expect(buildExportArchive({ files: 'nope' }, missing)).rejects.toThrow();
  });
});
