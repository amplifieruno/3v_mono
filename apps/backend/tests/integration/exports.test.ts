import { describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import {
  createDefinition,
  definition,
  exportNow,
  fileText,
  jsonRows,
  requestExport,
  runExportCron,
  settledJob,
} from './support/exports.js';
import { deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { createProfile } from './support/segments.js';
import { ago, camera, insertRow, q } from './support/retention.js';
import { runSqlRows } from './support/sql.js';

/** Exports (slice 10 task 4): run as the requesting member (Review Focus 4), incremental watermark, schedules. */

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const second = await createTestUser();
  await addMember(orgA.id, second.id);
  return {
    org: orgA.id,
    orgB: orgB.id,
    user,
    second,
    a: asOrgAdmin(user.id, orgA.id),
    a2: asOrgAdmin(second.id, orgA.id),
    b: asOrgAdmin(other.id, orgB.id),
  };
}

const DASHBOARD = `mutation ($o: dashboards_insert_input!) { insert_dashboards_one(object: $o) { id } }`;
const OPEN = `mutation ($id: uuid!) { open_file(file_id: $id) { url } }`;
const widget = { id: 'kpis', kind: 'kpi', title: 'Today', query: 'dashboard_kpis', params: {}, position: { x: 0, y: 0, w: 12, h: 2 } };

describe('Exports run with the requesting member permissions (Review Focus 4)', () => {
  it('should never put rows the member cannot read into the file', async () => {
    const w = await world();
    // A personal dashboard of the first admin: its audit rows are private to them.
    const { insert_dashboards_one: dash } = await w.a.request<{ insert_dashboards_one: { id: string } }>(DASHBOARD, {
      o: { name: 'Private board', widgets: [widget] },
    });
    await createProfile(w.b);

    const mine = await createDefinition(w.a, { entity: 'audit_log', format: 'json' });
    const theirs = await createDefinition(w.a2, { entity: 'audit_log', format: 'json' });
    const jobA = await exportNow(w.a, mine.id);
    const jobA2 = await exportNow(w.a2, theirs.id);
    expect(jobA).toMatchObject({ status: 'completed', requested_by: w.user.id });
    expect(jobA2).toMatchObject({ status: 'completed', requested_by: w.second.id });

    const rowsA = await jsonRows(String(jobA.file_id));
    const rowsA2 = await jsonRows(String(jobA2.file_id));
    expect(rowsA.some((r) => r.entity === 'dashboards' && r.entity_id === dash.id)).toBe(true);
    expect(rowsA2.some((r) => r.entity === 'dashboards')).toBe(false);
    for (const r of [...rowsA, ...rowsA2]) expect(r.organization_id).toBe(w.org);
    expect(jobA2.row_count).toBe(rowsA2.length);
    // Exactly the member's readable columns.
    expect(Object.keys(rowsA2[0]).sort()).toEqual(
      ['action', 'changes', 'entity', 'entity_id', 'id', 'ip', 'occurred_at', 'organization_id', 'reason', 'user_agent', 'user_id'],
    );

    // The file is the requester's: sensitive (not selectable) and owner-only (only they open it; audited).
    const files = await w.a.request<{ files: unknown[] }>(`query($id: uuid!) { files(where: {id: {_eq: $id}}) { id } }`, { id: jobA.file_id });
    expect(files.files).toEqual([]);
    await w.a.request(OPEN, { id: jobA.file_id });
    expect((await expectError(w.a2.request(OPEN, { id: jobA.file_id }))).message).toContain('File not found');
    const views = await runSqlRows(
      `select user_id from itap.audit_log where action = 'view_sensitive' and entity_id = '${jobA.file_id}'`,
    );
    expect(views).toEqual([{ user_id: w.user.id }]);
    const [exported] = await runSqlRows(
      `select user_id, changes ->> 'row_count' as rows from itap.audit_log where action = 'export' and entity_id = '${jobA.id}'`,
    );
    expect(exported).toEqual({ user_id: w.user.id, rows: String(jobA.row_count) });
  });

  it('should let only the owner run or edit a definition and keep jobs read-only and org-scoped', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles' });
    expect(d.owner_id).toBe(w.user.id);
    expect((await expectError(requestExport(w.a2, d.id))).message).toContain('export_owner_only');
    expect(await updateByPk(w.a2, 'export_definitions', d.id, { name: 'Taken over' })).toBeNull();
    expect(await deleteByPk(w.a2, 'export_definitions', d.id)).toBeNull();
    await expectDenied(updateByPk(w.a, 'export_definitions', d.id, { watermark: new Date().toISOString() }), 'watermark');
    await expectDenied(insertOne(w.a, 'export_definitions', { name: 'x', entity: 'profiles', owner_id: w.second.id }), 'owner_id');
    await expectError(createDefinition(w.a, { entity: 'integrations' }));
    await expectError(createDefinition(w.a, { entity: 'profiles', schedule_cron: 'hourly' }));
    const job = await requestExport(w.a, d.id);
    await expectDenied(updateByPk(w.a, 'export_jobs', job.id, { status: 'failed' }), 'update_export_jobs_by_pk');
    expect((await expectError(requestExport(w.a, d.id))).message).toMatch(/export_job_active|export_jobs_one_open/);
    expect((await w.b.request<{ export_jobs: unknown[] }>(`query { export_jobs { id } }`)).export_jobs).toEqual([]);
    expect((await w.b.request<{ export_definitions: unknown[] }>(`query { export_definitions { id } }`)).export_definitions).toEqual([]);
    await settledJob(job.id);
  });
});

describe('Export contents and modes', () => {
  it('should export incrementally from the watermark, advancing it only on completion', async () => {
    const w = await world();
    const tag = `Inc${Date.now().toString(36)}`;
    await createProfile(w.a, { last_name: tag, first_name: '=HYPERLINK("http://x")' });
    await createProfile(w.a, { last_name: tag, first_name: 'Plain' });
    const d = await createDefinition(w.a, { entity: 'profiles', mode: 'incremental', format: 'csv', filters: { last_name: { _eq: tag } } });

    const first = await exportNow(w.a, d.id);
    expect(first).toMatchObject({ status: 'completed', row_count: 2, watermark_from: null });
    const csv = await fileText(String(first.file_id));
    expect(csv).toContain(`"'=HYPERLINK(""http://x"")"`);
    expect(csv.split('\r\n')[0].split(',')).toContain('first_name');
    const mark = (await definition(d.id)).watermark;
    expect(mark).not.toBeNull();
    expect(first.watermark_to).toBe(mark);

    const third = await createProfile(w.a, { last_name: tag, first_name: 'Later' });
    const second = await exportNow(w.a, d.id);
    expect(second).toMatchObject({ status: 'completed', row_count: 1, watermark_from: mark });
    expect(await fileText(String(second.file_id))).toContain(third);
    const mark2 = (await definition(d.id)).watermark;
    expect(Date.parse(String(mark2))).toBeGreaterThan(Date.parse(String(mark)));
    expect(await exportNow(w.a, d.id)).toMatchObject({ status: 'completed', row_count: 0 });
    expect((await definition(d.id)).watermark).toBe(mark2);

    // A failing job (invalid filter) never moves the watermark; editing the filter resets it.
    await updateByPk(w.a, 'export_definitions', d.id, { filters: { no_such_column: { _eq: 1 } } });
    expect((await definition(d.id)).watermark).toBeNull();
    const failed = await exportNow(w.a, d.id);
    expect(failed.status).toBe('failed');
    expect(failed.error).toContain('invalid_filters');
    expect((await definition(d.id)).watermark).toBeNull();
  });

  it('should render xlsx, and limit detections to the last 31 days', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles', format: 'xlsx' });
    await createProfile(w.a);
    const job = await exportNow(w.a, d.id);
    expect(job).toMatchObject({ status: 'completed', row_count: 1 });
    const { createStorageClient } = await import('../../src/storage/storageClient.js');
    const { testEnv } = await import('./support/clients.js');
    const bytes = await createStorageClient(testEnv()).download(String(job.file_id));
    expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');

    const facility = await insertOne(w.a, 'facilities', { name: 'Export site' });
    const device = await camera(w.a, facility.id);
    for (const days of [2, 40]) {
      await insertRow('detections', {
        organization_id: q(w.org), device_id: q(device), detected_at: ago(days), bbox: `'{"x":1,"y":2,"width":3,"height":4}'::jsonb`,
      });
    }
    const det = await exportNow(w.a, (await createDefinition(w.a, { entity: 'detections', format: 'json' })).id);
    expect(det).toMatchObject({ status: 'completed', row_count: 1 });
  });
});

describe('Scheduled exports', () => {
  it('should create jobs for due definitions as the owner and skip owners who left', async () => {
    const w = await world();
    const d = await createDefinition(w.a, { entity: 'profiles', schedule_cron: '0 * * * *' });
    await runExportCron([w.org], '2026-10-20T10:07:00Z');
    expect((await definition(d.id)).next_run_at).toBe('2026-10-20T11:00:00+00:00');
    expect(await runExportCron([w.org], '2026-10-20T11:00:00Z')).toMatchObject({ jobs_created: 1 });
    const [row] = await runSqlRows(`select id, trigger, requested_by from itap.export_jobs where definition_id = '${d.id}'`);
    expect(row).toMatchObject({ trigger: 'schedule', requested_by: w.user.id });
    expect(await settledJob(String(row.id))).toMatchObject({ status: 'completed' });
    expect(await runExportCron([w.org], '2026-10-20T11:00:00Z')).toMatchObject({ jobs_created: 0 });

    const left = await createDefinition(w.a2, { entity: 'profiles', schedule_cron: '0 * * * *' });
    await runExportCron([w.org], '2026-10-20T11:07:00Z');
    await asAdmin().request(
      `mutation($o: uuid!, $u: uuid!) { update_organization_members(where: {organization_id: {_eq: $o}, user_id: {_eq: $u}}, _set: {status: deactivated, deactivated_at: "now()"}) { affected_rows } }`,
      { o: w.org, u: w.second.id },
    );
    expect(await runExportCron([w.org], '2026-10-20T12:00:00Z')).toMatchObject({ jobs_created: 1 });
    expect(await definition(left.id)).toMatchObject({ last_error: 'owner_not_member', next_run_at: '2026-10-20T13:00:00+00:00' });
  });
});
