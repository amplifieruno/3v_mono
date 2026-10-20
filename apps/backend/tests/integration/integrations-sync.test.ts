import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import {
  createIntegration,
  integration,
  requestSync,
  runScheduleCron,
  settledRun,
  syncedProfiles,
  syncNow,
  uploadFixture,
} from './support/integrations.js';
import { insertOne, updateByPk } from './support/operations.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/** Integrations (slice 10 task 4): HR fixture sync, stubs, failures, secret never in payloads, schedules. */

async function world() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  return { org: orgA.id, orgB: orgB.id, user, a: asOrgAdmin(user.id, orgA.id), b: asOrgAdmin(other.id, orgB.id) };
}

const MAPPING = { given: 'first_name', family: 'last_name', mail: 'email', dept: 'department' };
const person = (id: string, given: string, dept: string) => ({ emp_id: id, given, family: 'Sync', mail: `${id.toLowerCase()}@hr.test`, dept });

async function hrIntegration(w: Awaited<ReturnType<typeof world>>, records: unknown) {
  const fixture = await uploadFixture(w.org, JSON.stringify(records));
  return createIntegration(w.a, {
    kind: 'hr',
    config: { fixture_file_id: fixture, external_id_field: 'emp_id' },
    field_mapping: MAPPING,
  });
}

describe('HR fixture sync', () => {
  it('should create, update and deactivate profiles idempotently by (integration, external_id)', async () => {
    const w = await world();
    const manual = await createProfile(w.a, { external_id: 'E3' });
    const hr = await hrIntegration(w, [person('E1', 'Ann', 'Ops'), person('E2', 'Bob', 'Ops'), person('E3', 'Cid', 'IT')]);

    const first = await syncNow(w.a, hr.id);
    expect(first).toMatchObject({
      status: 'succeeded', trigger: 'manual', requested_by: w.user.id, records_in: 3, created_count: 3, updated_count: 0,
      deactivated_count: 0, skipped_count: 0, errors: [],
    });
    expect(await syncedProfiles(w.org, hr.id)).toEqual([
      { external_id: 'E1', first_name: 'Ann', last_name: 'Sync', email: 'e1@hr.test', department: 'Ops', status: 'active' },
      { external_id: 'E2', first_name: 'Bob', last_name: 'Sync', email: 'e2@hr.test', department: 'Ops', status: 'active' },
      { external_id: 'E3', first_name: 'Cid', last_name: 'Sync', email: 'e3@hr.test', department: 'IT', status: 'active' },
    ]);
    // Written as the synthetic actor: no user, reason integration:<code>.
    const audits = await runSqlRows(
      `select user_id, reason from itap.audit_log where organization_id = '${w.org}' and entity = 'profiles' and action = 'insert'
         and entity_id in (select id from itap.profiles where source_integration_id = '${hr.id}')`,
    );
    expect(audits).toHaveLength(3);
    for (const row of audits) expect(row).toMatchObject({ user_id: 'NULL', reason: `integration:${hr.code}` });
    const after = await integration(hr.id);
    expect(after).toMatchObject({ status: 'active', last_error: null });
    expect(after.last_sync_at).not.toBeNull();

    // Same fixture again: nothing changes.
    expect(await syncNow(w.a, hr.id)).toMatchObject({
      status: 'succeeded', records_in: 3, records_out: 0, created_count: 0, updated_count: 0, deactivated_count: 0,
    });

    // CSV fixture: E1 moves department, E2 unchanged, E3 gone, E4 new.
    const csv = ['emp_id,given,family,mail,dept', 'E1,Ann,Sync,e1@hr.test,Finance', 'E2,Bob,Sync,e2@hr.test,Ops', 'E4,Dee,Sync,e4@hr.test,IT'].join('\r\n');
    const fixture = await uploadFixture(w.org, csv, 'csv');
    await updateByPk(w.a, 'integrations', hr.id, { config: { fixture_file_id: fixture, external_id_field: 'emp_id' } });
    expect(await syncNow(w.a, hr.id)).toMatchObject({
      status: 'succeeded', records_in: 3, records_out: 3, created_count: 1, updated_count: 1, deactivated_count: 1,
    });
    const synced = await syncedProfiles(w.org, hr.id);
    expect(synced.map((p) => [p.external_id, p.department, p.status])).toEqual([
      ['E1', 'Finance', 'active'], ['E2', 'Ops', 'active'], ['E3', 'IT', 'inactive'], ['E4', 'IT', 'active'],
    ]);
    expect(await syncNow(w.a, hr.id)).toMatchObject({ created_count: 0, updated_count: 0, deactivated_count: 0, records_out: 0 });
    // A profile of the same external id that the integration does not own is untouched.
    const [own] = await runSqlRows(`select status, source_integration_id from itap.profiles where id = '${manual}'`);
    expect(own).toMatchObject({ status: 'active', source_integration_id: 'NULL' });
  });

  it('should skip bad records with codes only (never source values) and keep going', async () => {
    const w = await world();
    const hr = await hrIntegration(w, [
      person('E1', 'Ann', 'Ops'),
      { given: 'NoId', family: 'Sync' },
      person('E1', 'Dup', 'Ops'),
      { emp_id: 'E9', given: '', family: 'Sync' },
      'not an object',
    ]);
    const run = await syncNow(w.a, hr.id);
    expect(run).toMatchObject({ status: 'succeeded', records_in: 5, created_count: 1, skipped_count: 4 });
    expect(run.errors.map((e) => e.code)).toEqual(['missing_external_id', 'duplicate_external_id', 'missing_name', 'invalid_record']);
    expect(JSON.stringify(run.errors)).not.toMatch(/NoId|Dup|E9/);
  });
});

describe('Integration failures', () => {
  it('should mark the integration error with an integration_failed event (no secret anywhere), and clear it on success', async () => {
    const w = await world();
    const hr = await createIntegration(w.a, { kind: 'hr', config: {}, field_mapping: MAPPING });
    await w.a.request(`mutation($id: uuid!) { set_integration_secret(integration_id: $id, secret: "hunter2-token") { has_secret } }`, { id: hr.id });
    const [stored] = await runSqlRows(`select secret from itap.integrations where id = '${hr.id}'`);
    const ciphertext = String(stored.secret);
    expect(ciphertext).toMatch(/^v2:/);

    const failed = await syncNow(w.a, hr.id);
    expect(failed).toMatchObject({ status: 'failed', error: 'fixture_not_found' });
    expect(await integration(hr.id)).toMatchObject({ status: 'error', last_error: 'fixture_not_found' });
    const events = await runSqlRows(
      `select event_type, severity, payload::text as payload from itap.events where organization_id = '${w.org}' and event_type = 'integration_failed'`,
    );
    expect(events).toHaveLength(1);
    expect(JSON.parse(String(events[0].payload))).toMatchObject({ integration_id: hr.id, code: hr.code, kind: 'hr', run_id: failed.id, error: 'fixture_not_found' });
    // The secret (plaintext or ciphertext) is in no event payload, no Hasura event log row and no audit row.
    const leaks = await runSqlRows(
      `select (select count(*) from itap.events where organization_id = '${w.org}' and (payload::text like '%${ciphertext}%' or payload::text like '%hunter2%' or payload ? 'secret')) as events,
              (select count(*) from hdb_catalog.event_log where payload::text like '%${ciphertext}%' or payload::text like '%hunter2%') as hasura,
              (select count(*) from itap.audit_log where organization_id = '${w.org}' and (changes::text like '%${ciphertext}%' or changes::text like '%hunter2%')) as audit`,
    );
    expect(leaks[0]).toEqual({ events: '0', hasura: '0', audit: '0' });
    // run_sync payloads carry only the configured columns.
    const [log] = await runSqlRows(
      `select payload::text as payload from hdb_catalog.event_log where trigger_name = 'run_sync' and payload -> 'data' -> 'new' ->> 'id' = '${failed.id}'`,
    );
    expect(Object.keys(JSON.parse(String(log.payload)).data.new).sort()).toEqual(['id', 'integration_id', 'organization_id', 'trigger']);

    // A fixed configuration succeeds and clears the error.
    const fixture = await uploadFixture(w.org, JSON.stringify([person('E1', 'Ann', 'Ops')]));
    await updateByPk(w.a, 'integrations', hr.id, { config: { fixture_file_id: fixture, external_id_field: 'emp_id' } });
    expect(await syncNow(w.a, hr.id)).toMatchObject({ status: 'succeeded', created_count: 1 });
    expect(await integration(hr.id)).toMatchObject({ status: 'active', last_error: null });
  });

  it('should fail a stub with a simulated outage and refuse paused, foreign or concurrent syncs', async () => {
    const w = await world();
    const bms = await createIntegration(w.a, { kind: 'bms', config: { simulate_error: 'connection refused' } });
    expect(await syncNow(w.a, bms.id)).toMatchObject({ status: 'failed', error: 'connection refused' });
    expect(await integration(bms.id)).toMatchObject({ status: 'error', last_error: 'connection refused' });

    const paused = await createIntegration(w.a, { kind: 'siem', status: 'paused' });
    expect((await expectError(requestSync(w.a, paused.id))).code).toBe('integration_paused');
    expect((await expectError(requestSync(w.b, bms.id))).code).toBe('integration_not_found');
    const siem = await createIntegration(w.a, { kind: 'siem' });
    await runSql(`insert into itap.integration_sync_runs (organization_id, integration_id) values ('${w.org}', '${siem.id}')`);
    expect((await expectError(requestSync(w.a, siem.id))).code).toBe('integration_sync_running');
  });
});

describe('Stub kinds', () => {
  it('should push the events since the last sync (SIEM) and snapshot occupancy (BMS) with real run rows', async () => {
    const w = await world();
    const siem = await createIntegration(w.a, { kind: 'siem' });
    for (let i = 0; i < 2; i += 1) {
      await runSql(
        `insert into itap.events (organization_id, event_type, severity, title, occurred_at) values ('${w.org}', 'integration_failed', 'low', 'Test ${i}', now())`,
      );
    }
    expect(await syncNow(w.a, siem.id)).toMatchObject({ status: 'succeeded', records_out: 2 });
    expect(await syncNow(w.a, siem.id)).toMatchObject({ status: 'succeeded', records_out: 0 });
    const bms = await createIntegration(w.a, { kind: 'bms' });
    expect(await syncNow(w.a, bms.id)).toMatchObject({ status: 'succeeded', records_in: 0 });
  });
});

describe('Integration permissions and schedules', () => {
  it('should keep sync runs read-only and org-scoped', async () => {
    const w = await world();
    const siem = await createIntegration(w.a, { kind: 'siem' });
    const run = await syncNow(w.a, siem.id);
    await expectDenied(insertOne(w.a, 'integration_sync_runs', { integration_id: siem.id }), 'insert_integration_sync_runs_one');
    await expectDenied(updateByPk(w.a, 'integration_sync_runs', run.id, { status: 'failed' }), 'update_integration_sync_runs_by_pk');
    const seen = await w.b.request<{ integration_sync_runs: unknown[] }>(`query { integration_sync_runs { id } }`);
    expect(seen.integration_sync_runs).toEqual([]);
    await expectDenied(updateByPk(w.a, 'integrations', siem.id, { next_sync_at: new Date().toISOString() }), 'next_sync_at');
    await expectError(updateByPk(w.a, 'integrations', siem.id, { config: { schedule_cron: 'every minute' } }));
  });

  it('should run scheduled syncs from config.schedule_cron through the cron', async () => {
    const w = await world();
    const siem = await createIntegration(w.a, { kind: 'siem', config: { schedule_cron: '0 * * * *' } });
    await runScheduleCron([w.org], '2026-10-20T10:07:00Z');
    expect((await integration(siem.id)).next_sync_at).toBe('2026-10-20T11:00:00+00:00');
    const result = await runScheduleCron([w.org], '2026-10-20T11:00:00Z');
    expect(result).toMatchObject({ runs_created: 1 });
    expect((await integration(siem.id)).next_sync_at).toBe('2026-10-20T12:00:00+00:00');
    const [row] = await runSqlRows(`select id, trigger from itap.integration_sync_runs where integration_id = '${siem.id}'`);
    expect(row.trigger).toBe('schedule');
    expect(await settledRun(String(row.id))).toMatchObject({ status: 'succeeded', requested_by: null });
    // A retried cron delivery for the same slot changes nothing.
    expect(await runScheduleCron([w.org], '2026-10-20T11:00:00Z')).toMatchObject({ runs_created: 0 });
  });
});
