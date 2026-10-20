import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { asOrgAdmin, testEnv } from './support/clients.js';
import { fileDsr, jobCall, readDsr, settledDsr } from './support/dsr.js';
import { createDefinition, exportJob } from './support/exports.js';
import { createTwoOrgs } from './support/fixtures.js';
import { report, settled } from './support/reports.js';
import { count, queued } from './support/retention.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/**
 * Erasure fence (slice 10 final wave, I-1): a DSR bundle, an export job or a report whose attempt was claimed before
 * an erasure committed must not attach a file produced from data that named the erased person. Each case claims the
 * work in the same transaction that creates it (the backend job then finds it leased and skips it), erases the
 * person, then completes the stale attempt.
 */

async function world() {
  const { orgA, user } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const person = await createProfile(a, { last_name: `Fence${Date.now().toString(36)}` });
  return { org: orgA.id, user: user.id, a, person };
}

async function uploadTagged(org: string, metadata: Record<string, string>): Promise<string> {
  const storage = createStorageClient(testEnv());
  return (await storage.upload({ bucketId: org, name: `fence-${randomUUID().slice(0, 8)}.bin`, mimeType: 'application/octet-stream', data: Buffer.from('names the person'), metadata })).id;
}

async function erase(w: Awaited<ReturnType<typeof world>>): Promise<void> {
  const dsr = await fileDsr(w.a, w.person, 'erasure');
  expect(await settledDsr(dsr.id)).toMatchObject({ status: 'completed' });
}

/** Queued for deletion, or already deleted by a drain. */
async function queuedOrGone(file: string): Promise<boolean> {
  return (await queued(file)) || (await count(`storage.files where id = '${file}'`)) === 0;
}

describe('Erasure fence', () => {
  it('should reject an access bundle completed after its subject was erased (no file attached)', async () => {
    const w = await world();
    const id = randomUUID();
    await runSql(
      `insert into itap.data_subject_requests (id, organization_id, profile_id, request_type, requested_by)
       values ('${id}', '${w.org}', '${w.person}', 'access', '${w.user}');
       select * from itap.claim_dsr('${id}')`,
    );
    expect((await jobCall('dsr_bundle', `'${id}', 1`)).length).toBe(1);
    const file = await uploadTagged(w.org, { kind: 'dsr_export', dsr_id: id });
    await erase(w);
    const [done] = await jobCall('complete_dsr_export', `'${id}', 1, '${file}', '{}'`);
    expect(done).toMatchObject({ status: 'rejected', rejection_reason: 'subject_erased', export_file_id: 'NULL' });
    expect(await readDsr(id)).toMatchObject({ status: 'rejected', export_file_id: null });
    expect(await queuedOrGone(file)).toBe(true);
    expect(await count(`itap.audit_log where action = 'export' and entity_id = '${w.person}'`)).toBe(0);
  });

  it('should requeue an export job whose attempt was claimed before an erasure, then complete the re-run', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles', format: 'json', filters: { id: { _eq: w.person } } });
    const job = randomUUID();
    await runSql(
      `insert into itap.export_jobs (id, organization_id, definition_id, requested_by)
       values ('${job}', '${w.org}', '${d.id}', '${w.user}');
       select * from itap.claim_export_job('${job}')`,
    );
    const stale = await uploadTagged(w.org, { kind: 'export', export_job_id: job });
    await runSql(`update storage.files set uploaded_by_user_id = '${w.user}' where id = '${stale}'`);
    await erase(w);
    const done = await runSqlRows(`select id from itap.complete_export_job('${job}', 1, '${stale}', 1, false, null, null, '{${w.person}}')`);
    expect(done).toEqual([]);
    expect(await exportJob(job)).toMatchObject({ status: 'queued', error: 'subject_erased', file_id: null, attempts: 1 });
    expect(await queuedOrGone(stale)).toBe(true);
    // The re-run (claimed after the erasure) completes.
    expect(await runSqlRows(`select attempts from itap.claim_export_job('${job}')`)).toEqual([{ attempts: '2' }]);
    const fresh = await uploadTagged(w.org, { kind: 'export', export_job_id: job });
    await runSql(`update storage.files set uploaded_by_user_id = '${w.user}' where id = '${fresh}'`);
    const again = await runSqlRows(`select status from itap.complete_export_job('${job}', 2, '${fresh}', 1, false, null, null, '{${w.person}}')`);
    expect(again).toEqual([{ status: 'completed' }]);
  });

  it('should requeue a report whose attempt was claimed before an erasure; the re-run regenerates it', async () => {
    const w = await world();
    const id = randomUUID();
    const day = new Date().toISOString().slice(0, 10);
    await runSql(
      `insert into itap.reports (id, organization_id, report_type, title, format, start_date, end_date)
       values ('${id}', '${w.org}', 'flow', 'Fence', 'json', '${day}', '${day}');
       select * from itap.claim_report('${id}')`,
    );
    const stale = await uploadTagged(w.org, { kind: 'report', report_id: id });
    await erase(w);
    const done = await runSqlRows(`select id from itap.complete_report('${id}', 1, '${stale}', '{}')`);
    expect(done).toEqual([]);
    const regenerated = await settled(id);
    expect(regenerated).toMatchObject({ status: 'completed', attempts: 2 });
    expect(regenerated.file_id).not.toBe(stale);
    expect(await queuedOrGone(stale)).toBe(true);
  });
});
