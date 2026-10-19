import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { requireBackend } from './support/backend.js';
import { callJobFn, jobRows, settledJob, startJob } from './support/bulk.js';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createIdentityFromPhotos, FACES, uploadFace } from './support/enrollment.js';
import { addMember, createTestUser, createTwoOrgs, expectError } from './support/fixtures.js';
import { uploadSearchImage } from './support/search.js';
import { runSqlRows } from './support/sql.js';

/** bulk_search jobs (slice 7 task 4): one facial search per listed image, as the owner; results owner-only. */

beforeAll(requireBackend);

describe('bulk_search jobs', () => {
  it('should search every listed image as the owner, link the requests and keep the job private', async () => {
    const { orgA, user } = await createTwoOrgs();
    const colleague = await createTestUser();
    await addMember(orgA.id, colleague.id);
    const a = asOrgAdmin(user.id, orgA.id);
    const c = asOrgAdmin(colleague.id, orgA.id);
    const x = await createIdentityFromPhotos(a, [await uploadFace(orgA.id, FACES.personA1)]);

    const match = await uploadSearchImage(user.id, orgA.id, FACES.personA2);
    const noFace = await uploadSearchImage(user.id, orgA.id, FACES.noFace);
    const colleagues = await uploadSearchImage(colleague.id, orgA.id, FACES.personA2);
    const csv = [
      'label,image_file_id',
      `visitor 1,${match}`,
      `blurry,${noFace}`,
      `someone else's,${colleagues}`,
      `typo,not-a-uuid`,
      `missing,${randomUUID()}`,
    ].join('\n');
    const job = await startJob(a, user.id, orgA.id, 'bulk_search', csv, { threshold: 0.3, max_results: 3 });
    const done = await settledJob(job.id, 90000);
    expect(done).toMatchObject({ status: 'partial', total: 5, succeeded: 1, failed: 4 });

    const rows = await jobRows(job.id);
    expect(rows.map((r) => [r.row_no, r.outcome, r.error, r.label])).toEqual([
      [1, 'matched', null, 'visitor 1'],
      [2, 'failed', 'no_face', 'blurry'],
      [3, 'failed', 'file_not_found', "someone else's"],
      [4, 'failed', 'invalid_value:image_file_id', 'typo'],
      [5, 'failed', 'file_not_found', 'missing'],
    ]);
    expect(rows[0]).toMatchObject({ identity_id: x.identity_id, entity_code: x.identity_code });
    expect(rows[0].confidence).toBeGreaterThan(0.3);

    // The searches are the owner's requests, linked to the job and its records.
    const requests = await runSqlRows(`SELECT user_id::text, bulk_job_row_no::text AS row_no, status, max_results::text, threshold::text
      FROM itap.search_requests WHERE bulk_job_id = '${job.id}' ORDER BY bulk_job_row_no`);
    expect(requests).toEqual([
      { user_id: user.id, row_no: '1', status: 'completed', max_results: '3', threshold: '0.3' },
      { user_id: user.id, row_no: '2', status: 'failed', max_results: '3', threshold: '0.3' },
    ]);
    expect(rows[0].search_request_id).not.toBeNull();

    // Personal: the colleague sees neither the job, its rows nor the result file, and cannot manage it.
    const q = `query ($id: uuid!) { bulk_jobs(where: { id: { _eq: $id } }) { id } bulk_job_rows(where: { bulk_job_id: { _eq: $id } }) { row_no } }`;
    expect(await c.request(q, { id: job.id })).toEqual({ bulk_jobs: [], bulk_job_rows: [] });
    expect((await a.request<{ bulk_job_rows: unknown[] }>(q, { id: job.id })).bulk_job_rows).toHaveLength(5);
    await expectError(callJobFn(c, 'retry_bulk_job', job.id));
    const fileQ = `query ($id: uuid!) { files(where: { id: { _eq: $id } }) { id metadata } }`;
    expect((await c.request<{ files: unknown[] }>(fileQ, { id: done.result_file_id })).files).toEqual([]);
    const own = await a.request<{ files: { metadata: { kind: string } }[] }>(fileQ, { id: done.result_file_id });
    expect(own.files[0].metadata.kind).toBe('bulk_search_result');
    const [stored] = await runSqlRows(`SELECT uploaded_by_user_id::text AS u FROM storage.files WHERE id = '${done.result_file_id}'`);
    expect(stored.u).toBe(user.id);

    // Retry re-runs only the failed records (the matched search is not repeated).
    await callJobFn(a, 'retry_bulk_job', job.id);
    await settledJob(job.id, 90000);
    const [{ n }] = await runSqlRows(`SELECT count(*)::text AS n FROM itap.search_requests WHERE bulk_job_id = '${job.id}' AND bulk_job_row_no = 1`);
    expect(n).toBe('1');
    expect((await asAdmin().request<{ bulk_jobs_by_pk: { status: string } }>(`query ($id: uuid!) { bulk_jobs_by_pk(id: $id) { status } }`, { id: job.id })).bulk_jobs_by_pk.status).toBe('partial');
  });

  it('should refuse profile columns and dry_run for bulk_search', async () => {
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await expectError(startJob(a, user.id, orgA.id, 'bulk_search', 'image_file_id\n', { dry_run: true }));
    const job = await startJob(a, user.id, orgA.id, 'bulk_search', 'image_file_id,first_name\nx,y');
    expect(await settledJob(job.id)).toMatchObject({ status: 'failed', error: 'header_unknown:first_name' });
  });
});
