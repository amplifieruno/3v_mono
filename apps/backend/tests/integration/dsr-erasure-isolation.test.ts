import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { fileDsr, settledDsr } from './support/dsr.js';
import { createTwoOrgs } from './support/fixtures.js';
import { insertRow, q } from './support/retention.js';
import { createProfile } from './support/segments.js';
import { runSql, runSqlRows } from './support/sql.js';

/**
 * Fix round 2: low-entropy identifiers (an employee id like 'active', 'admin' or '1') must never alter unrelated
 * data — audit rows, events, deliveries, reports, Hasura trigger logs — in the organization or in another one.
 */

const json = (v: unknown): string => `${q(JSON.stringify(v))}::jsonb`;

/** Unrelated rows whose values contain the low-entropy strings, in one organization. */
async function unrelatedRows(org: string, user: string): Promise<void> {
  const values = { status: 'active', role: 'admin', count: '1', note: 'active admin 1', employee_ref: 'admin' };
  await insertRow('audit_log', {
    organization_id: q(org), action: q('update'), entity: q('companies'), entity_id: 'gen_random_uuid()', changes: json(values),
  });
  const event = await insertRow('events', {
    organization_id: q(org), event_type: q('admin_action'), title: q('active'), occurred_at: 'now()', payload: json(values),
  });
  const subscription = await insertRow('notification_subscriptions', {
    organization_id: q(org), user_id: q(user), event_type: q('admin_action'), channel: q('in_app'),
  });
  await insertRow('notification_deliveries', {
    organization_id: q(org), subscription_id: q(subscription), event_id: q(event), recipient_user_id: q(user), channel: q('in_app'),
    status: q('delivered'), content: json({ title: 'admin', body: 'active 1', items: ['1', 'admin'] }), sent_at: 'now()', delivered_at: 'now()',
  });
  const [file] = await runSqlRows(
    `insert into storage.files (bucket_id, name, mime_type, size, is_uploaded, metadata)
     values ('${org}', 'health.csv', 'text/csv', 1, true, '{"kind": "report"}') returning id`,
  );
  await insertRow('reports', {
    organization_id: q(org), report_type: q('device_health'), title: q('admin'), format: q('csv'), status: q('completed'),
    start_date: 'current_date', end_date: 'current_date', file_id: q(String(file.id)), generated_at: 'now()',
  });
  await runSql(
    `insert into hdb_catalog.event_log (schema_name, table_name, trigger_name, payload, delivered)
     values ('itap', 'companies', 'isolation_test', ${json({ data: { old: null, new: { organization_id: org, ...values } } })}, true)`,
  );
}

/** Fingerprint of every pre-existing row of the organizations in the guarded tables. */
async function fingerprint(orgs: string[], before: string): Promise<Record<string, string | null>> {
  const list = orgs.map((o) => q(o)).join(', ');
  const [r] = await runSqlRows(
    `select
       (select md5(string_agg(x::text, '|' order by x.id)) from itap.audit_log x
         where x.organization_id in (${list}) and x.occurred_at < '${before}' and x.entity <> 'profiles') as audit,
       (select md5(string_agg(x::text, '|' order by x.id)) from itap.events x where x.organization_id in (${list})) as events,
       (select md5(string_agg(x::text, '|' order by x.id)) from itap.notification_deliveries x where x.organization_id in (${list})) as deliveries,
       (select md5(string_agg(x::text, '|' order by x.id)) from itap.reports x where x.organization_id in (${list})) as reports,
       (select md5(string_agg(x.id || x.payload::text, '|' order by x.id)) from hdb_catalog.event_log x
         where x.trigger_name = 'isolation_test' and x.payload #>> '{data,new,organization_id}' in (${list})) as event_log`,
  );
  return r;
}

describe('DSR erasure with low-entropy identifiers', () => {
  it('should change no unrelated audit rows, events, deliveries, reports or trigger logs in any organization', async () => {
    const { orgA, orgB, user, other } = await createTwoOrgs();
    const a = asOrgAdmin(user.id, orgA.id);
    await unrelatedRows(orgA.id, user.id);
    await unrelatedRows(orgB.id, other.id);
    const subjects = await Promise.all(
      ['active', 'admin', '1'].map((employee) => createProfile(a, { first_name: 'Lo', last_name: 'Entropy', employee_id: employee, phone: '1' })),
    );
    const [{ t }] = await runSqlRows(`select (now() + interval '1 second')::text as t`);
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const before = await fingerprint([orgA.id, orgB.id], String(t));
    for (const profile of subjects) {
      expect(await settledDsr((await fileDsr(a, profile, 'erasure')).id)).toMatchObject({ status: 'completed', partial: false });
    }
    expect(await fingerprint([orgA.id, orgB.id], String(t))).toEqual(before);
    await runSql(`delete from hdb_catalog.event_log where trigger_name = 'isolation_test' and payload #>> '{data,new,organization_id}' in ('${orgA.id}', '${orgB.id}')`);
  }, 120_000);
});
