import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { fileDsr, settledDsr } from './support/dsr.js';
import { createDefinition, definition, exportNow, jsonRows, requestExport, settledJob } from './support/exports.js';
import { ago, count, fileRow, purgeAll, queued } from './support/retention.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Exports fix round 1 (slice 10 task 4): keyset cursor, cross-org filters, requester checks, retention, erasure. */

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  return { org: orgA.id, orgB: orgB.id, user, a: asOrgAdmin(user.id, orgA.id), b: asOrgAdmin(other.id, orgB.id) };
}

describe('Incremental keyset cursor', () => {
  it('should export every row exactly once when more rows than max_rows share the last watermark', async () => {
    const w = await world();
    const tag = `Same${Date.now().toString(36)}`;
    for (let i = 0; i < 5; i += 1) {
      await runSql(
        `insert into itap.profiles (organization_id, first_name, last_name, created_at)
         values ('${w.org}', 'P${i}', '${tag}', '2026-10-01T10:00:00Z')`,
      );
    }
    const d = await createDefinition(w.a, { entity: 'profiles', mode: 'incremental', format: 'json', max_rows: 3, filters: { last_name: { _eq: tag } } });
    const first = await exportNow(w.a, d.id);
    expect(first).toMatchObject({ status: 'completed', row_count: 3, truncated: true });
    const second = await exportNow(w.a, d.id);
    expect(second).toMatchObject({ status: 'completed', row_count: 2, truncated: false });
    const third = await exportNow(w.a, d.id);
    expect(third).toMatchObject({ status: 'completed', row_count: 0 });
    const ids = [...(await jsonRows(String(first.file_id))), ...(await jsonRows(String(second.file_id)))].map((r) => r.id);
    expect(new Set(ids).size).toBe(5);
    expect(ids).toHaveLength(5);
    const def = await definition(d.id);
    expect(def.watermark).toBe('2026-10-01T10:00:00+00:00');
    const [cursor] = await runSqlRows(`select watermark_id from itap.export_definitions where id = '${d.id}'`);
    expect(cursor.watermark_id).toBe(ids[4]);
  });
});

describe('Export guards', () => {
  it('should never return another organization rows whatever the filter says', async () => {
    const w = await world();
    await createProfile(w.b);
    await createProfile(w.a);
    const own = await count(`itap.profiles where organization_id = '${w.org}'`);
    const foreign = await exportNow(w.a, (await createDefinition(w.a, { entity: 'profiles', filters: { organization_id: { _eq: w.orgB } } })).id);
    expect(foreign).toMatchObject({ status: 'completed', row_count: 0 });
    const either = await exportNow(
      w.a,
      (await createDefinition(w.a, { entity: 'profiles', format: 'json', filters: { _or: [{ organization_id: { _eq: w.orgB } }, { id: { _is_null: false } }] } })).id,
    );
    expect(either.row_count).toBe(own);
    for (const r of await jsonRows(String(either.file_id))) expect(r.organization_id).toBe(w.org);
  });

  it('should refuse a disabled requester and a suspended organization (requester_not_member)', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles' });
    const jobSql = `insert into itap.export_jobs (organization_id, definition_id, requested_by, entity, format, mode)
                    values ('${w.org}', '${d.id}', '${w.user.id}', 'profiles', 'csv', 'full')`;
    // The requester is disabled / the organization suspended after the request, before the job runs.
    await runSql(`${jobSql}; update auth.users set disabled = true where id = '${w.user.id}'`);
    const [first] = await runSqlRows(`select id from itap.export_jobs where definition_id = '${d.id}'`);
    expect(await settledJob(String(first.id))).toMatchObject({ status: 'failed', error: 'requester_not_member' });
    expect((await expectError(requestExport(w.a, d.id))).message).toContain('member_not_active:requested_by');
    await runSql(`update auth.users set disabled = false where id = '${w.user.id}'`);
    await runSql(`${jobSql}; update itap.organizations set status = 'suspended' where id = '${w.org}'`);
    const [second] = await runSqlRows(`select id from itap.export_jobs where definition_id = '${d.id}' and status <> 'failed'`);
    expect(await settledJob(String(second.id))).toMatchObject({ status: 'failed', error: 'requester_not_member' });
    await runSql(`update itap.organizations set status = 'active' where id = '${w.org}'`);
  });
});

describe('Export retention and erasure', () => {
  it('should purge old export jobs with their files, sweep orphan export files and old sync runs', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles' });
    const job = await exportNow(w.a, d.id);
    await runSql(`update itap.export_jobs set finished_at = now() - interval '40 days' where id = '${job.id}'`);
    const orphan = await fileRow(w.org, 'export', { export_job_id: '00000000-0000-4000-8000-000000000009' });
    await runSql(`update storage.files set created_at = now() - interval '40 days' where id = '${orphan}'`);
    const r = await purgeAll('export_jobs', w.org, ago(30));
    expect(r.affected).toBe(2);
    expect(await count(`itap.export_jobs where id = '${job.id}'`)).toBe(0);
    expect(await queued(String(job.file_id))).toBe(true);
    expect(await queued(orphan)).toBe(true);

    const [integration] = await runSqlRows(
      `insert into itap.integrations (organization_id, name, kind, provider) values ('${w.org}', 'Old', 'siem', 'X') returning id`,
    );
    await runSql(
      `insert into itap.integration_sync_runs (organization_id, integration_id, status, started_at, finished_at)
       values ('${w.org}', '${integration.id}', 'succeeded', now() - interval '41 days', now() - interval '40 days')`,
    );
    expect(await purgeAll('integration_sync_runs', w.org, ago(30))).toMatchObject({ affected: 1 });
    const allowed = await runSqlRows(
      `select itap.retention_action_allowed('export_jobs', 'delete')::text as e, itap.retention_action_allowed('integration_sync_runs', 'delete')::text as i,
              (itap.retention_class_order('export_jobs') is not null)::text as o1, (itap.retention_class_order('integration_sync_runs') is not null)::text as o2`,
    );
    expect(allowed[0]).toEqual({ e: 'true', i: 'true', o1: 'true', o2: 'true' });
  });

  it('should delete the export files that contain an erased person (subjects recorded per job)', async () => {
    const w = await world();
    const tag = `Erase${Date.now().toString(36)}`;
    const person = await createProfile(w.a, { last_name: tag });
    const other = await createProfile(w.a, { last_name: `${tag}x` });
    const withPerson = await exportNow(w.a, (await createDefinition(w.a, { entity: 'profiles', filters: { last_name: { _eq: tag } } })).id);
    const without = await exportNow(w.a, (await createDefinition(w.a, { entity: 'profiles', filters: { id: { _eq: other } } })).id);
    const [rec] = await runSqlRows(`select ('${person}' = any (subject_ids))::text as hit from itap.export_jobs where id = '${withPerson.id}'`);
    expect(rec.hit).toBe('true');
    const dsr = await fileDsr(w.a, person, 'erasure');
    expect(await settledDsr(dsr.id)).toMatchObject({ status: 'completed' });
    expect(await count(`itap.export_jobs where id = '${withPerson.id}'`)).toBe(0);
    expect(await count(`storage.files where id = '${withPerson.file_id}'`)).toBe(0);
    expect(await count(`itap.export_jobs where id = '${without.id}'`)).toBe(1);
  });
});
