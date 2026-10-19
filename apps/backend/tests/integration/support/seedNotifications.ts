import { expect } from 'vitest';
import { asOrgAdmin } from './clients.js';
import { hmac } from './sending.js';
import { runSqlRows } from './sql.js';

/** Assertions on the seeded Nova Tower notifications (slice 5, task 5), shared by the seed test. */
type ReportRow = { channel: string; total: number; delivered: number; ack_rate: number | null; avg_response_seconds: number | null; escalations: number };

export async function expectSeededNotifications(slug: string): Promise<void> {
  const org = `(select id from itap.organizations where slug = '${slug}')`;
  const created = `(select created_at from itap.organizations where slug = '${slug}')`;
  const [config] = await runSqlRows(
    `select (select count(*) from itap.notification_templates where organization_id = ${org}) as templates,
            (select count(*) from itap.notification_templates where organization_id = ${org} and locale = 'ru') as ru_templates,
            (select string_agg(name, ',' order by name) from itap.recipient_groups where organization_id = ${org}) as groups,
            (select string_agg(code, ',' order by code) from itap.notification_rules where organization_id = ${org}) as rules,
            (select count(*) from itap.on_call_schedule_members where organization_id = ${org}) as on_call,
            (select string_agg(s.channel || ':' || s.after_minutes, ',' order by s.step_no) from itap.escalation_policy_steps s
               join itap.escalation_policies p on p.id = s.policy_id where p.organization_id = ${org} and p.repeat) as steps,
            (select count(*) from itap.notification_subscriptions where organization_id = ${org}) as subscriptions,
            (select url from itap.webhook_subscriptions where organization_id = ${org}) as webhook_url,
            (select count(*) from itap.event_rules r join itap.event_rule_versions v on v.id = r.current_version_id
               where r.organization_id = ${org} and v.escalation_policy_id is not null) as escalating_rules`,
  );
  expect(config).toMatchObject({
    templates: '22',
    ru_templates: '11',
    groups: 'Facility managers,On-call,Security team',
    rules: 'NRULE-00001,NRULE-00002,NRULE-00003,NRULE-00004',
    on_call: '3',
    steps: 'in_app:0,email:0,sms:10',
    subscriptions: '2',
    escalating_rules: '1',
  });
  expect(config.webhook_url).toMatch(/\/hasura\/events\/webhook-sink$/);

  // History produced by the replay through Stage C: a few hundred rows, dated in the past and all settled.
  const [volume] = await runSqlRows(
    `select count(*) as total,
            count(*) filter (where d.status in ('pending', 'retrying')) as unsettled,
            count(*) filter (where d.status = 'dead_letter') as dead,
            count(*) filter (where d.status = 'digested') as digested,
            count(*) filter (where d.escalation_step_id is not null) as escalation,
            count(*) filter (where d.subscription_id is not null) as subscription,
            count(*) filter (where e.event_type = 'blacklist_match' and d.channel = 'in_app') as blacklist_in_app,
            count(*) filter (where e.event_type = 'blacklist_match' and d.channel = 'email') as blacklist_email
       from itap.notification_deliveries d left join itap.events e on e.id = d.event_id
      where d.organization_id = ${org} and d.created_at < ${created}`,
  );
  const n = (key: string): number => Number(volume[key]);
  expect(n('total')).toBeGreaterThan(50);
  expect(n('total')).toBeLessThan(1000);
  expect(n('unsettled')).toBe(0);
  for (const key of ['dead', 'digested', 'escalation', 'subscription', 'blacklist_in_app', 'blacklist_email']) expect(n(key), key).toBeGreaterThan(0);

  const inbox = await runSqlRows(
    `select u.email, count(*) as n, count(n.acknowledged_at) as acknowledged from itap.user_notifications n
       join auth.users u on u.id = n.user_id where n.organization_id = ${org} and n.created_at < ${created} group by u.email order by u.email`,
  );
  expect(inbox.map((r) => r.email)).toEqual(['admin@itap.demo', 'nova.admin@itap.demo']);
  expect(inbox.every((r) => Number(r.acknowledged) > 0)).toBe(true);

  const hooks = await runSqlRows(
    `select w.status, w.response_code::text, w.signature, w.body::text, s.secret from itap.webhook_deliveries w
       join itap.webhook_subscriptions s on s.id = w.subscription_id where w.organization_id = ${org}`,
  );
  expect(hooks.length).toBeGreaterThan(0);
  for (const h of hooks) {
    expect(h).toMatchObject({ status: 'sent', response_code: '200' });
    expect(h.signature).toBe(hmac(h.secret ?? '', JSON.stringify(JSON.parse(h.body ?? '{}'))));
  }

  // Watch-rule incidents escalated in history; the open critical one is the live demo, still under its policy.
  const incidents = await runSqlRows(
    `select i.status, i.severity, i.escalation_step::text as step, i.escalation_policy_id is not null as policy,
            (select count(*) from itap.incident_activities a where a.incident_id = i.id and a.kind = 'escalated'
               and a.actor_id is null and a.occurred_at < i.last_escalated_at + interval '1 second') as escalated
       from itap.incidents i where i.organization_id = ${org} and i.escalation_policy_id is not null`,
  );
  expect(incidents.length).toBeGreaterThanOrEqual(3);
  expect(incidents.every((i) => Number(i.escalated) >= 2)).toBe(true);
  const open = incidents.filter((i) => i.status === 'open');
  expect(open).toHaveLength(1);
  expect(open[0]).toMatchObject({ severity: 'critical' });
  expect(Number(open[0].step)).toBeGreaterThanOrEqual(5);

  const [admin] = await runSqlRows(`select id from auth.users where email = 'admin@itap.demo'`);
  const [orgRow] = await runSqlRows(`select id from itap.organizations where slug = '${slug}'`);
  const data = await asOrgAdmin(admin.id ?? '', orgRow.id ?? '').request<{ delivery_report: ReportRow[] }>(
    `query($f: timestamptz!, $t: timestamptz!) { delivery_report(args: {p_from: $f, p_to: $t}) {
      channel total delivered ack_rate avg_response_seconds escalations } }`,
    { f: new Date(Date.now() - 32 * 86_400_000).toISOString(), t: new Date().toISOString() },
  );
  const report = Object.fromEntries(data.delivery_report.map((r) => [r.channel, r]));
  expect(report.in_app.delivered).toBeGreaterThan(0);
  expect(report.in_app.ack_rate).toBeGreaterThan(0);
  expect(report.in_app.ack_rate).toBeLessThanOrEqual(1);
  expect(report.in_app.avg_response_seconds).toBeGreaterThanOrEqual(60);
  expect(report.in_app.avg_response_seconds).toBeLessThanOrEqual(600);
  expect(report.email.total).toBeGreaterThan(0);
  expect(report.sms.escalations).toBeGreaterThan(0);
}
