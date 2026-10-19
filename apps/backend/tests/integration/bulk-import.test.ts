import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStorageClient } from '../../src/storage/storageClient.js';
import { requireBackend } from './support/backend.js';
import { bulkJob, jobRows, settledJob, startJob, uploadCsv } from './support/bulk.js';
import { asAdmin, asOrgAdmin, testEnv } from './support/clients.js';
import { createTwoOrgs } from './support/fixtures.js';
import { insertOne } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

/**
 * Bulk profile import / update (slice 7 task 4, Review Focus 4): valid rows committed one by one as the owner,
 * invalid rows recorded with their error, partial status, dry run, header validation, result file.
 */

beforeAll(requireBackend);

async function importWorld() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const company = await insertOne(a, 'companies', { name: 'Acme Corp' });
  const schedule = await insertOne(a, 'work_schedules', { name: 'Day shift', windows: [] });
  await insertOne(a, 'custom_attribute_definitions', { entity: 'profile', key: 'badge', label: 'Badge', data_type: 'number' });
  await insertOne(a, 'custom_attribute_definitions', {
    entity: 'profile', key: 'shirt', label: 'Shirt', data_type: 'enum', options: ['S', 'M', 'L'],
  });
  return { orgA, orgB, user, other, a, company: company.id, schedule: schedule.id };
}

type Profile = { id: string; code: string; first_name: string; last_name: string; email: string | null; company_id: string | null;
  work_schedule_id: string | null; start_date: string | null; profile_type: string; access_level: string; custom_fields: Record<string, unknown>;
  department: string | null; employee_id: string | null };

async function profilesOf(orgId: string, lastNamePrefix: string): Promise<Profile[]> {
  const data = await asAdmin().request<{ profiles: Profile[] }>(
    `query ($org: uuid!, $p: String!) { profiles(where: { organization_id: { _eq: $org }, last_name: { _like: $p } }, order_by: { last_name: asc }) {
      id code first_name last_name email company_id work_schedule_id start_date profile_type access_level custom_fields department employee_id } }`,
    { org: orgId, p: `${lastNamePrefix}%` },
  );
  return data.profiles;
}

describe('bulk profile import', () => {
  it('should commit valid rows as the owner, record invalid rows and end partial with a result file', async () => {
    const w = await importWorld();
    const tag = `Imp${randomUUID().slice(0, 6)}`;
    const csv = [
      'first_name,last_name,email,company,work_schedule,start_date,profile_type,access_level,custom.badge,custom.shirt',
      `Ada,${tag}-1,ada@example.com,acme corp,Day shift,2026-01-05,contractor,elevated,42,M`,
      `Bob,${tag}-2,,${w.company},,,,,,`,
      `Cy,${tag}-3,,,,,,,,XL`,
      `Dee,,,,,,,,,`,
      `Eve,${tag}-5,,Nope Inc,,,,,,`,
      `Fay,${tag}-6,,,,2026-02-30,,,,`,
      `Gus,${tag}-7,,,,,,,abc,`,
      ',,,,,,,,,',
      `"Hal, Jr.",${tag}-9,,,,,alien,,,`,
    ].join('\r\n');
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csv);
    expect(job).toMatchObject({ kind: 'profile_import', owner_id: w.user.id });
    expect(job.code).toMatch(/^BULK-\d{5}$/);

    const done = await settledJob(job.id);
    expect(done).toMatchObject({ status: 'partial', total: 9, processed: 9, succeeded: 2, failed: 6, skipped: 1, error: null });
    expect(done.errors).toEqual([
      { row_no: 3, error: 'custom_field_invalid:shirt' },
      { row_no: 4, error: 'required:last_name' },
      { row_no: 5, error: 'company_not_found' },
      { row_no: 6, error: 'invalid_date:start_date' },
      { row_no: 7, error: 'custom_field_invalid:badge' },
      { row_no: 9, error: 'invalid_value:profile_type' },
    ]);

    const created = await profilesOf(w.orgA.id, tag);
    expect(created.map((p) => p.last_name)).toEqual([`${tag}-1`, `${tag}-2`]);
    expect(created[0]).toMatchObject({
      first_name: 'Ada', email: 'ada@example.com', company_id: w.company, work_schedule_id: w.schedule, start_date: '2026-01-05',
      profile_type: 'contractor', access_level: 'elevated', custom_fields: { badge: 42, shirt: 'M' },
    });
    expect(created[1]).toMatchObject({ company_id: w.company, profile_type: 'employee', access_level: 'basic', custom_fields: {} });

    const rows = await jobRows(job.id);
    expect(rows.map((r) => [r.row_no, r.outcome])).toEqual([
      [1, 'created'], [2, 'created'], [3, 'failed'], [4, 'failed'], [5, 'failed'], [6, 'failed'], [7, 'failed'], [8, 'skipped'], [9, 'failed'],
    ]);
    expect(rows[0]).toMatchObject({ profile_id: created[0].id, entity_code: created[0].code });

    // The profile insert ran as the owner: audit actor.
    const audit = await runSqlRows(`SELECT user_id::text FROM itap.audit_log WHERE entity = 'profiles' AND entity_id = '${created[0].id}' AND action = 'insert'`);
    expect(audit).toEqual([{ user_id: w.user.id }]);

    // Result file: org bucket, kind bulk_result, one line per record.
    expect(done.result_file_id).not.toBeNull();
    const [file] = await runSqlRows(`SELECT bucket_id, metadata ->> 'kind' AS kind FROM storage.files WHERE id = '${done.result_file_id}'`);
    expect(file).toEqual({ bucket_id: w.orgA.id, kind: 'bulk_result' });
    const text = (await createStorageClient(testEnv()).download(done.result_file_id ?? '')).toString('utf8');
    const lines = text.split('\r\n');
    expect(lines[0]).toBe('row_no,outcome,entity_id,entity_code,error');
    expect(lines[1]).toBe(`1,created,${created[0].id},${created[0].code},`);
    expect(lines[3]).toBe('3,failed,,,custom_field_invalid:shirt');
    expect(lines[8]).toBe('8,skipped,,,');
    expect(lines).toHaveLength(11);
  });

  it('should validate a dry run as the owner without committing anything', async () => {
    const w = await importWorld();
    const tag = `Dry${randomUUID().slice(0, 6)}`;
    const [before] = await runSqlRows(`SELECT coalesce((SELECT last_value FROM itap.organization_counters WHERE organization_id = '${w.orgA.id}' AND entity = 'profile'), 0) AS n`);
    const csv = ['first_name,last_name,custom.badge', `A,${tag}-1,1`, `B,${tag}-2,x`].join('\n');
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csv, { dry_run: true });
    const done = await settledJob(job.id);
    expect(done).toMatchObject({ status: 'partial', succeeded: 1, failed: 1 });
    expect((await jobRows(job.id)).map((r) => [r.outcome, r.profile_id, r.error])).toEqual([
      ['validated', null, null],
      ['failed', null, 'custom_field_invalid:badge'],
    ]);
    expect(await profilesOf(w.orgA.id, tag)).toEqual([]);
    const [after] = await runSqlRows(`SELECT coalesce((SELECT last_value FROM itap.organization_counters WHERE organization_id = '${w.orgA.id}' AND entity = 'profile'), 0) AS n`);
    expect(after.n).toBe(before.n);
  });

  it('should fail the job on header problems and limits before applying any row', async () => {
    const w = await importWorld();
    const cases: [string, string][] = [
      ['first_name,last_name,salary\nA,B,1', 'header_unknown:salary'],
      ['first_name,last_name,custom.unknown\nA,B,1', 'header_unknown:custom.unknown'],
      ['first_name,email\nA,a@x', 'header_missing:last_name'],
      ['first_name,last_name,First_Name\nA,B,C', 'header_duplicate:first_name'],
      ['\n', 'header_missing'],
      ['first_name,last_name\n"A,B', 'csv_invalid: unterminated quoted field in record 2'],
      [`first_name,last_name\n${'A,B\n'.repeat(10_001)}`, 'too_many_rows'],
      [`first_name,last_name,email\nA,B,${'x'.repeat(5 * 1024 * 1024)}`, 'file_too_large'],
    ];
    for (const [csv, error] of cases) {
      const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_import', csv);
      const done = await settledJob(job.id);
      expect(done, error).toMatchObject({ status: 'failed', error, processed: 0, succeeded: 0 });
      expect(await jobRows(job.id)).toEqual([]);
    }
  });
});

describe('bulk profile update', () => {
  it('should update profiles found by the key column, merging custom fields and leaving empty cells unchanged', async () => {
    const w = await importWorld();
    const tag = `Upd${randomUUID().slice(0, 6)}`;
    const p1 = await insertOne<{ id: string; code: string }>(w.a, 'profiles', {
      first_name: 'A', last_name: `${tag}-1`, employee_id: `${tag}-E1`, email: `${tag}@x.io`, department: 'Ops', custom_fields: { shirt: 'S' },
    }, 'id code');
    await insertOne(w.a, 'profiles', { first_name: 'B', last_name: `${tag}-2`, employee_id: `${tag}-DUP` });
    await insertOne(w.a, 'profiles', { first_name: 'C', last_name: `${tag}-3`, employee_id: `${tag}-DUP` });
    const csv = [
      'employee_id,department,custom.badge,email',
      `${tag}-E1,Security,7,`,
      `${tag}-NOPE,Security,,`,
      `${tag}-DUP,Security,,`,
    ].join('\n');
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_update', csv);
    const done = await settledJob(job.id);
    expect(done).toMatchObject({ status: 'partial', succeeded: 1, failed: 2 });
    expect((await jobRows(job.id)).map((r) => [r.outcome, r.profile_id, r.entity_code, r.error])).toEqual([
      ['updated', p1.id, p1.code, null],
      ['failed', null, null, 'profile_not_found'],
      ['failed', null, null, 'profile_key_ambiguous'],
    ]);
    const [updated] = await profilesOf(w.orgA.id, `${tag}-1`);
    expect(updated).toMatchObject({ department: 'Security', email: `${tag}@x.io`, employee_id: `${tag}-E1`, custom_fields: { shirt: 'S', badge: 7 } });

    // By code (case-insensitive email works the same way).
    const byCode = await startJob(w.a, w.user.id, w.orgA.id, 'profile_update', `code,job_title\n${p1.code.toLowerCase()},Lead`, { update_key: 'code' });
    expect(await settledJob(byCode.id)).toMatchObject({ status: 'completed', succeeded: 1 });
    expect((await profilesOf(w.orgA.id, `${tag}-1`))[0]).toMatchObject({ department: 'Security' });
  });

  it('should refuse options of another kind and a key column that is not the update key', async () => {
    const w = await importWorld();
    const file = await uploadCsv(w.user.id, w.orgA.id, 'email,department\na@x,Ops');
    const job = await startJob(w.a, w.user.id, w.orgA.id, 'profile_update', 'email,department\na@x,Ops');
    expect(await settledJob(job.id)).toMatchObject({ status: 'failed', error: 'header_missing:employee_id' });
    await expect(w.a.request(`mutation ($o: bulk_jobs_insert_input!) { insert_bulk_jobs_one(object: $o) { id } }`, {
      o: { kind: 'profile_import', input_file_id: file, options: { update_key: 'email' } },
    })).rejects.toThrow();
    expect((await bulkJob(job.id)).attempts).toBe(1);
  });
});
