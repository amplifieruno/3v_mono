import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { bulkJob, callJobFn, jobRows, runResumeCron, settledJob, startJob, uploadCsv } from './support/bulk.js';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { insertOne } from './support/operations.js';
import { waitFor } from './support/sending.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Bulk job lifecycle (slice 7 task 4): crash resume, attempt fencing, cancel, retry of failed rows, owner checks. */

beforeAll(requireBackend);

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const colleague = await createTestUser();
  await addMember(orgA.id, colleague.id);
  return { orgA, orgB, user, other, colleague, a: asOrgAdmin(user.id, orgA.id), c: asOrgAdmin(colleague.id, orgA.id) };
}

const csvOf = (tag: string, n: number) =>
  ['first_name,last_name', ...Array.from({ length: n }, (_, i) => `F${i + 1},${tag}-${String(i + 1).padStart(4, '0')}`)].join('\n');

async function countProfiles(orgId: string, tag: string): Promise<Record<string, number>> {
  const rows = await runSqlRows(`SELECT last_name, count(*)::text AS n FROM itap.profiles WHERE organization_id = '${orgId}' AND last_name LIKE '${tag}-%' GROUP BY last_name`);
  return Object.fromEntries(rows.map((r) => [r.last_name ?? '', Number(r.n)]));
}

const APPLY = `mutation ($j: uuid!, $a: Int!, $r: Int!, $d: jsonb!) {
  bulk_apply_profile_row(args: { p_job: $j, p_attempt: $a, p_row_no: $r, p_data: $d }) { row_no outcome profile_id }
}`;

/** A job a worker claimed (attempt 1, total 5) and that died after committing row 3 but reporting only 2 processed. */
async function crashedJob(w: Awaited<ReturnType<typeof world>>, tag: string): Promise<string> {
  const file = await uploadCsv(w.user.id, w.orgA.id, csvOf(tag, 5));
  const [row] = await runSqlRows(`INSERT INTO itap.bulk_jobs (organization_id, kind, owner_id, input_file_id, status, attempts, total, lease_expires_at, started_at)
    VALUES ('${w.orgA.id}', 'profile_import', '${w.user.id}', '${file}', 'running', 1, 5, now() + interval '1 minute', now()) RETURNING id`);
  const id = row.id ?? '';
  for (let r = 1; r <= 3; r += 1) {
    await w.a.request(APPLY, { j: id, a: 1, r, d: { first_name: `F${r}`, last_name: `${tag}-${String(r).padStart(4, '0')}` } });
  }
  await runSql(`UPDATE itap.bulk_jobs SET processed = 2 WHERE id = '${id}'`);
  return id;
}

describe('bulk job resume', () => {
  it('should resume a crashed job after its lease from processed without duplicating the in-flight row', async () => {
    const w = await world();
    const tag = `Res${randomUUID().slice(0, 6)}`;
    const id = await crashedJob(w, tag);
    // A live lease is not reclaimed.
    await runResumeCron([w.orgA.id]);
    expect((await bulkJob(id)).attempts).toBe(1);

    await runSql(`UPDATE itap.bulk_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = '${id}'`);
    expect(await runResumeCron([w.orgA.id])).toEqual({ jobs_started: 1 });
    const done = await settledJob(id);
    expect(done).toMatchObject({ status: 'completed', attempts: 2, total: 5, processed: 5, succeeded: 5, failed: 0 });
    const counts = await countProfiles(w.orgA.id, tag);
    expect(Object.keys(counts)).toHaveLength(5);
    expect(Object.values(counts).every((n) => n === 1)).toBe(true);

    // The stale worker (attempt 1) is fenced off.
    await expectError(w.a.request(APPLY, { j: id, a: 1, r: 4, d: { first_name: 'X', last_name: `${tag}-dup` } }));
    expect(await countProfiles(w.orgA.id, `${tag}-dup`)).toEqual({});
  });

  it('should apply a row only for the owner of a running job and return a committed row as is', async () => {
    const w = await world();
    const tag = `Own${randomUUID().slice(0, 6)}`;
    const id = await crashedJob(w, tag);
    const again = await w.a.request<{ bulk_apply_profile_row: { outcome: string; profile_id: string }[] }>(APPLY, {
      j: id, a: 1, r: 1, d: { first_name: 'Other', last_name: `${tag}-other` },
    });
    expect(again.bulk_apply_profile_row[0].outcome).toBe('created');
    expect(await countProfiles(w.orgA.id, `${tag}-other`)).toEqual({});
    await expectError(w.c.request(APPLY, { j: id, a: 1, r: 4, d: { first_name: 'C', last_name: `${tag}-c` } }));
    await expectError(w.a.request(APPLY, { j: id, a: 1, r: 6, d: { first_name: 'C', last_name: `${tag}-c` } }));
    await expectError(asOrgAdmin(w.other.id, w.orgB.id).request(APPLY, { j: id, a: 1, r: 4, d: { first_name: 'C', last_name: 'c' } }));
  });

  it('should fail a reclaimed job whose owner is no longer an active member', async () => {
    const w = await world();
    const id = await crashedJob(w, `Ina${randomUUID().slice(0, 6)}`);
    await runSql(`UPDATE itap.organization_members SET status = 'suspended' WHERE organization_id = '${w.orgA.id}' AND user_id = '${w.user.id}';
      UPDATE itap.bulk_jobs SET lease_expires_at = now() - interval '1 second' WHERE id = '${id}'`);
    await runResumeCron([w.orgA.id]);
    const done = await settledJob(id);
    expect(done).toMatchObject({ status: 'failed', error: 'owner_inactive', succeeded: 3 });
  });
});

describe('bulk job owner deactivated mid-run', () => {
  it('should stop applying rows and fail the job with owner_inactive', async () => {
    const w = await world();
    const tag = `Mid${randomUUID().slice(0, 6)}`;
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csvOf(tag, 1500));
    await waitFor(() => bulkJob(job.id), (j) => j.status === 'running' && j.processed > 0, 30000);
    await runSql(`UPDATE itap.organization_members SET status = 'suspended' WHERE organization_id = '${w.orgA.id}' AND user_id = '${w.user.id}'`);
    const done = await settledJob(job.id);
    expect(done).toMatchObject({ status: 'failed', error: 'owner_inactive' });
    expect(done.succeeded).toBeLessThan(1500);
    expect(Object.keys(await countProfiles(w.orgA.id, tag))).toHaveLength(done.succeeded);
  });
});

describe('bulk job cancel and retry', () => {
  it('should cancel a running job; the worker stops and the applied rows stay', async () => {
    const w = await world();
    const tag = `Can${randomUUID().slice(0, 6)}`;
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csvOf(tag, 1500));
    await waitFor(() => bulkJob(job.id), (j) => j.status === 'running' && j.processed > 0, 30000);
    // Any org_admin of the organization manages profile jobs.
    const [cancelled] = await callJobFn(w.c, 'cancel_bulk_job', job.id);
    expect(cancelled.status).toBe('cancelled');
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const settled = (await jobRows(job.id)).length;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect((await jobRows(job.id)).length).toBe(settled);
    expect(settled).toBeLessThan(1500);
    expect(Object.keys(await countProfiles(w.orgA.id, tag))).toHaveLength(settled);
    const after = await bulkJob(job.id);
    expect(after).toMatchObject({ status: 'cancelled', result_file_id: null });
    await expectError(callJobFn(w.a, 'cancel_bulk_job', job.id));
  });

  it('should retry only the rows without a successful outcome and replace the result file', async () => {
    const w = await world();
    const tag = `Ret${randomUUID().slice(0, 6)}`;
    await insertOne(w.a, 'custom_attribute_definitions', { entity: 'profile', key: 'tier', label: 'Tier', data_type: 'enum', options: ['gold'] });
    const csv = ['first_name,last_name,custom.tier', `A,${tag}-1,gold`, `B,${tag}-2,silver`, `C,${tag}-3,`].join('\n');
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csv);
    const first = await settledJob(job.id);
    expect(first).toMatchObject({ status: 'partial', succeeded: 2, failed: 1 });
    await expectError(callJobFn(w.a, 'retry_bulk_job', randomUUID()));

    await runSql(`UPDATE itap.custom_attribute_definitions SET options = '["gold","silver"]' WHERE organization_id = '${w.orgA.id}' AND key = 'tier'`);
    const [queued] = await callJobFn(w.a, 'retry_bulk_job', job.id);
    expect(queued).toMatchObject({ status: 'queued', processed: 0 });
    const second = await settledJob(job.id);
    expect(second).toMatchObject({ status: 'completed', succeeded: 3, failed: 0, errors: [], attempts: 2 });
    expect(await countProfiles(w.orgA.id, tag)).toEqual({ [`${tag}-1`]: 1, [`${tag}-2`]: 1, [`${tag}-3`]: 1 });
    expect(second.result_file_id).not.toBe(first.result_file_id);
    expect(await runSqlRows(`SELECT id FROM storage.files WHERE id = '${first.result_file_id}'`)).toEqual([]);
    await expectError(callJobFn(w.a, 'retry_bulk_job', job.id));
  });
});

describe('bulk job permissions', () => {
  it('should stamp the owner, keep system columns read-only and refuse other users\' input files', async () => {
    const w = await world();
    const file = await uploadCsv(w.user.id, w.orgA.id, 'first_name,last_name\nA,B');
    const insert = `mutation ($o: bulk_jobs_insert_input!) { insert_bulk_jobs_one(object: $o) { id owner_id status } }`;
    for (const column of ['owner_id', 'status', 'processed', 'result_file_id', 'errors']) {
      await expectDenied(w.a.request(insert, { o: { kind: 'profile_import', input_file_id: file, [column]: null } }), column);
    }
    // The input must be the owner's bulk_input file of the organization.
    await expectError(w.c.request(insert, { o: { kind: 'profile_import', input_file_id: file } }));
    const plain = await uploadCsv(w.user.id, w.orgA.id, 'first_name,last_name\nA,B', null);
    await expectError(w.a.request(insert, { o: { kind: 'profile_import', input_file_id: plain } }));
    await expectError(w.a.request(insert, { o: { kind: 'profile_import' } }));
    // bulk_input files are owner-only: invisible to colleagues, never another entity's file.
    const seen = await w.c.request<{ files: unknown[] }>(`query ($id: uuid!) { files(where: { id: { _eq: $id } }) { id } }`, { id: file });
    expect(seen.files).toEqual([]);
    await expectError(w.a.request(`mutation ($o: profiles_insert_input!) { insert_profiles_one(object: $o) { id } }`, {
      o: { first_name: 'A', last_name: 'B', avatar_file_id: file },
    }));

    const { insert_bulk_jobs_one: job } = await w.a.request<{ insert_bulk_jobs_one: { id: string; owner_id: string } }>(insert, {
      o: { kind: 'profile_import', input_file_id: file },
    });
    expect(job.owner_id).toBe(w.user.id);
    await settledJob(job.id);
    // Profile jobs are organization operations: colleagues see them and their rows; other organizations nothing.
    const q = `query ($id: uuid!) { bulk_jobs(where: { id: { _eq: $id } }) { id } bulk_job_rows(where: { bulk_job_id: { _eq: $id } }) { row_no } }`;
    expect(await w.c.request(q, { id: job.id })).toEqual({ bulk_jobs: [{ id: job.id }], bulk_job_rows: [{ row_no: 1 }] });
    expect(await asOrgAdmin(w.other.id, w.orgB.id).request(q, { id: job.id })).toEqual({ bulk_jobs: [], bulk_job_rows: [] });
    await expectError(callJobFn(asOrgAdmin(w.other.id, w.orgB.id), 'cancel_bulk_job', job.id));
    await expectDenied(w.a.request(`mutation ($id: uuid!) { delete_bulk_jobs_by_pk(id: $id) { id } }`, { id: job.id }), 'delete_bulk_jobs_by_pk');
    await expectDenied(w.a.request(`mutation ($id: uuid!) { update_bulk_jobs_by_pk(pk_columns: { id: $id }, _set: { status: queued }) { id } }`, { id: job.id }), 'update_bulk_jobs_by_pk');
    // Backend-only lifecycle functions are not exposed to org_admin.
    await expectDenied(w.a.request(`mutation ($id: uuid!) { claim_bulk_job(args: { p_job: $id }) { id } }`, { id: job.id }), 'claim_bulk_job');
    expect(await asAdmin().request(`query { bulk_job_kinds(order_by: { value: asc }) { value } }`)).toEqual({
      bulk_job_kinds: [{ value: 'bulk_search' }, { value: 'profile_import' }, { value: 'profile_update' }],
    });
  });
});
