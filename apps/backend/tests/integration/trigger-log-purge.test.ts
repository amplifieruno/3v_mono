import { afterAll, describe, expect, it } from 'vitest';
import { asAdmin, asOrgAdmin } from './support/clients.js';
import { createTwoOrgs, expectError } from './support/fixtures.js';
import { runSql, runSqlRows } from './support/sql.js';

// Fake trigger names: Hasura never delivers them (event_log rows below are delivered/locked, cron rows not scheduled).
const EVENT_TRIGGER = 'purge_test_event_trigger';
const CRON_TRIGGER = 'purge_test_cron_trigger';
const AT = '2026-03-10T12:00:00Z';

const PURGE = `mutation($at: timestamptz!, $keep: Int) {
  purge_trigger_logs(args: {p_at: $at, p_keep_days: $keep}) { log deleted } }`;

async function cleanup(): Promise<void> {
  await runSql(`
    delete from hdb_catalog.event_invocation_logs where trigger_name = '${EVENT_TRIGGER}';
    delete from hdb_catalog.event_log where trigger_name = '${EVENT_TRIGGER}';
    delete from hdb_catalog.hdb_cron_events where trigger_name = '${CRON_TRIGGER}';`);
}

afterAll(cleanup);

/** Inserts one event_log row (+ one invocation log) created `daysAgo` before AT; returns its id. */
async function eventLog(id: string, daysAgo: number, state: 'delivered' | 'error' | 'pending'): Promise<void> {
  const created = `(timestamptz '${AT}' - interval '${daysAgo} days') at time zone 'UTC'`;
  await runSql(`
    insert into hdb_catalog.event_log (id, schema_name, table_name, trigger_name, payload, delivered, error, created_at, locked)
    values ('${id}', 'itap', 'detections', '${EVENT_TRIGGER}', '{}', ${state === 'delivered'}, ${state === 'error'},
            ${created}, ${state === 'pending' ? 'now()' : 'null'});
    insert into hdb_catalog.event_invocation_logs (id, trigger_name, event_id, status, created_at)
    values ('inv-${id}', '${EVENT_TRIGGER}', '${id}', 200, ${created});`);
}

async function cronEvent(id: string, daysAgo: number, status: string): Promise<void> {
  const time = `timestamptz '${AT}' - interval '${daysAgo} days'`;
  await runSql(`
    insert into hdb_catalog.hdb_cron_events (id, trigger_name, scheduled_time, status, created_at)
    values ('${id}', '${CRON_TRIGGER}', ${time}, '${status}', ${time});
    insert into hdb_catalog.hdb_cron_event_invocation_logs (id, event_id, status, created_at)
    values ('inv-${id}', '${id}', 200, ${time});`);
}

describe('purge_trigger_logs', () => {
  it('should delete delivered/failed trigger logs older than keep_days and keep pending and recent ones', async () => {
    await cleanup();
    await eventLog('purge-old-delivered', 5, 'delivered');
    await eventLog('purge-old-error', 5, 'error');
    await eventLog('purge-old-pending', 5, 'pending');
    await eventLog('purge-new-delivered', 1, 'delivered');
    await cronEvent('purge-cron-old-delivered', 5, 'delivered');
    await cronEvent('purge-cron-old-dead', 5, 'dead');
    await cronEvent('purge-cron-old-scheduled', 5, 'scheduled');
    await cronEvent('purge-cron-new-delivered', 1, 'delivered');

    const data = await asAdmin().request<{ purge_trigger_logs: { log: string; deleted: number }[] }>(PURGE, { at: AT, keep: 3 });
    const deleted = Object.fromEntries(data.purge_trigger_logs.map((r) => [r.log, r.deleted]));
    expect(deleted.event_log).toBeGreaterThanOrEqual(2);
    expect(deleted.event_invocation_logs).toBeGreaterThanOrEqual(2);
    expect(deleted.hdb_cron_events).toBeGreaterThanOrEqual(2);
    expect(deleted.hdb_cron_event_invocation_logs).toBeGreaterThanOrEqual(2);

    const events = await runSqlRows(`select id from hdb_catalog.event_log where trigger_name = '${EVENT_TRIGGER}' order by id`);
    expect(events.map((r) => r.id)).toEqual(['purge-new-delivered', 'purge-old-pending']);
    const invocations = await runSqlRows(
      `select event_id from hdb_catalog.event_invocation_logs where trigger_name = '${EVENT_TRIGGER}' order by event_id`,
    );
    expect(invocations.map((r) => r.event_id)).toEqual(['purge-new-delivered', 'purge-old-pending']);
    const crons = await runSqlRows(`select id from hdb_catalog.hdb_cron_events where trigger_name = '${CRON_TRIGGER}' order by id`);
    expect(crons.map((r) => r.id)).toEqual(['purge-cron-new-delivered', 'purge-cron-old-scheduled']);
    const cronLogs = await runSqlRows(
      `select l.event_id from hdb_catalog.hdb_cron_event_invocation_logs l
       join hdb_catalog.hdb_cron_events e on e.id = l.event_id where e.trigger_name = '${CRON_TRIGGER}' order by 1`,
    );
    expect(cronLogs.map((r) => r.event_id)).toEqual(['purge-cron-new-delivered', 'purge-cron-old-scheduled']);

    // Idempotent: a second run at the same time finds nothing of ours to delete.
    await asAdmin().request(PURGE, { at: AT, keep: 3 });
    expect(await runSqlRows(`select id from hdb_catalog.event_log where trigger_name = '${EVENT_TRIGGER}'`)).toHaveLength(2);
  });

  it('should reject a negative keep_days and be admin-only', async () => {
    const err = await expectError(asAdmin().request(PURGE, { at: AT, keep: -1 }));
    expect(err.message).toMatch(/invalid_keep_days/);
    const { orgA, user } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await expect(a.request(PURGE, { at: AT, keep: 3 })).rejects.toThrow(/purge_trigger_logs/);
  });
});
