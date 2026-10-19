import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { addMember, createTestUser, createTwoOrgs, expectDenied, expectError } from './support/fixtures.js';
import { deleteByPk, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';

async function setup() {
  const { orgA, orgB, user, other } = await createTwoOrgs();
  const a = asOrgAdmin(user.id, orgA.id);
  const b = asOrgAdmin(other.id, orgB.id);
  return { orgA, orgB, user, other, a, b };
}

async function group(client: ReturnType<typeof asOrgAdmin>, name = 'Security') {
  return insertOne(client, 'recipient_groups', { name });
}

const FK = /foreign key|expected one of the values/i;

describe('notification vocabulary', () => {
  it('should rank priorities low < medium < high < critical and return NULL for unknown values', async () => {
    const [row] = await runSqlRows(
      `select itap.priority_rank('low') l, itap.priority_rank('medium') m, itap.priority_rank('high') h,
              itap.priority_rank('critical') c, itap.priority_rank('urgent') u`,
    );
    expect(row).toEqual({ l: '1', m: '2', h: '3', c: '4', u: 'NULL' });
  });

  it('should expose the five channels', async () => {
    const rows = await runSqlRows(`select value from itap.notification_channels order by value`);
    expect(rows.map((r) => r.value)).toEqual(['email', 'in_app', 'push', 'sms', 'webhook']);
  });
});

describe('notification templates', () => {
  it('should be unique per (name, channel, locale) and validate placeholders and locale', async () => {
    const s = await setup();
    const base = { name: 'incident_opened', channel: 'email', locale: 'en', subject: 'Incident {{code}}', body: 'Hi {{ recipient.name }}' };
    const t = await insertOne<{ id: string; is_system: boolean }>(s.a, 'notification_templates', base, 'id is_system');
    expect(t.is_system).toBe(false);
    const dup = await expectError(insertOne(s.a, 'notification_templates', base));
    expect(dup.message).toMatch(/notification_templates_organization_id_name_channel_locale_key|Uniqueness/i);
    await insertOne(s.a, 'notification_templates', { ...base, locale: 'ru' });
    await insertOne(s.a, 'notification_templates', { ...base, channel: 'in_app', subject: null });
    const bad = await expectError(insertOne(s.a, 'notification_templates', { ...base, name: 'x', body: 'Hi {{ 1bad }}' }));
    expect(bad.message).toMatch(/notification_templates_placeholders_valid/);
    const unclosed = await expectError(insertOne(s.a, 'notification_templates', { ...base, name: 'y', body: 'Hi {{name' }));
    expect(unclosed.message).toMatch(/notification_templates_placeholders_valid/);
    const locale = await expectError(insertOne(s.a, 'notification_templates', { ...base, name: 'z', locale: 'English' }));
    expect(locale.message).toMatch(/notification_templates_locale_format/);
    const noSubject = await expectError(insertOne(s.a, 'notification_templates', { ...base, name: 'w', subject: null }));
    expect(noSubject.message).toMatch(/notification_templates_email_subject/);
  });

  it('should not allow org_admin to set, edit or delete system templates', async () => {
    const s = await setup();
    await expectDenied(
      insertOne(s.a, 'notification_templates', { name: 'sys', channel: 'in_app', locale: 'en', body: 'x', is_system: true }),
      'is_system',
    );
    await runSqlRows(
      `insert into itap.notification_templates (organization_id, name, channel, locale, body, is_system)
       values ('${s.orgA.id}', 'sys', 'in_app', 'en', 'System {{code}}', true)`,
    );
    const [row] = await runSqlRows(`select id from itap.notification_templates where organization_id='${s.orgA.id}'`);
    const upd = await updateByPk(s.a, 'notification_templates', row.id as string, { body: 'hacked' });
    expect(upd).toBeNull();
    expect(await deleteByPk(s.a, 'notification_templates', row.id as string)).toBeNull();
  });

  it('should isolate organizations', async () => {
    const s = await setup();
    await insertOne(s.a, 'notification_templates', { name: 'n', channel: 'in_app', locale: 'en', body: 'b' });
    const seen = await s.b.request<{ notification_templates: unknown[] }>(`query { notification_templates { id } }`);
    expect(seen.notification_templates).toEqual([]);
  });
});

describe('recipient groups', () => {
  it('should require exactly one of user and external address', async () => {
    const s = await setup();
    const g = await group(s.a);
    const none = await expectError(insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'email' }));
    expect(none.message).toMatch(/recipient_group_members_exactly_one_recipient/);
    const both = await expectError(
      insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'email', user_id: s.user.id, external_address: 'a@b.co' }),
    );
    expect(both.message).toMatch(/recipient_group_members_exactly_one_recipient/);
    await insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'email', user_id: s.user.id });
    await insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'email', external_address: 'ops@example.com' });
  });

  it('should validate external address formats per channel', async () => {
    const s = await setup();
    const g = await group(s.a);
    const add = (channel: string, external_address: string) =>
      insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel, external_address });
    expect((await expectError(add('email', 'not-an-email'))).message).toMatch(/recipient_group_members_address_format/);
    expect((await expectError(add('sms', '12345'))).message).toMatch(/recipient_group_members_address_format/);
    expect((await expectError(add('in_app', 'x@y.zz'))).message).toMatch(/recipient_group_members_address_format/);
    expect((await expectError(add('push', '+15551234567'))).message).toMatch(/recipient_group_members_address_format/);
    await add('sms', '+15551234567');
    await add('email', 'x@y.zz');
    const hook = await expectError(
      insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'webhook', user_id: s.user.id }),
    );
    expect(hook.message).toMatch(/recipient_group_members_user_channel/);
  });

  it('should reject duplicate members and non-active or foreign users', async () => {
    const s = await setup();
    const g = await group(s.a);
    const row = { group_id: g.id, channel: 'email', user_id: s.user.id };
    await insertOne(s.a, 'recipient_group_members', row);
    const dup = await expectError(insertOne(s.a, 'recipient_group_members', row));
    expect(dup.message).toMatch(/recipient_group_members_user_key|Uniqueness/i);
    const gone = await createTestUser();
    await addMember(s.orgA.id, gone.id, 'deactivated');
    const inactive = await expectError(insertOne(s.a, 'recipient_group_members', { ...row, user_id: gone.id }));
    expect(inactive.message).toMatch(/member_not_active:user_id/);
    const foreign = await expectError(insertOne(s.a, 'recipient_group_members', { ...row, user_id: s.other.id }));
    expect(foreign.message).toMatch(FK);
  });

  it('should cascade members with their group but keep a group referenced by a step', async () => {
    const s = await setup();
    const g = await group(s.a);
    await insertOne(s.a, 'recipient_group_members', { group_id: g.id, channel: 'email', user_id: s.user.id });
    const policy = await insertOne(s.a, 'escalation_policies', { name: 'p' });
    await insertOne(s.a, 'escalation_policy_steps', { policy_id: policy.id, step_no: 1, after_minutes: 0, recipient_group_id: g.id, channel: 'email' });
    const blocked = await expectError(deleteByPk(s.a, 'recipient_groups', g.id));
    expect(blocked.message).toMatch(FK);
    const free = await group(s.a, 'Free');
    await insertOne(s.a, 'recipient_group_members', { group_id: free.id, channel: 'in_app', user_id: s.user.id });
    await deleteByPk(s.a, 'recipient_groups', free.id);
    const [left] = await runSqlRows(`select count(*) n from itap.recipient_group_members where group_id='${free.id}'`);
    expect(left.n).toBe('0');
  });

  it('should isolate organizations', async () => {
    const s = await setup();
    const g = await group(s.a);
    const seen = await s.b.request<{ recipient_groups: unknown[] }>(`query { recipient_groups { id } }`);
    expect(seen.recipient_groups).toEqual([]);
    const err = await expectError(insertOne(s.b, 'recipient_group_members', { group_id: g.id, channel: 'email', external_address: 'a@b.co' }));
    expect(err.message).toMatch(FK);
  });
});

describe('escalation policies', () => {
  it('should enforce step order, group XOR schedule and non-negative delays', async () => {
    const s = await setup();
    const policy = await insertOne(s.a, 'escalation_policies', { name: 'critical', repeat: true });
    const g = await group(s.a);
    const sched = await insertOne(s.a, 'on_call_schedules', { name: 'oc', timezone: 'Europe/Berlin', shift_length_hours: 24, rotation_start_at: '2026-01-01T00:00:00Z' });
    const step = { policy_id: policy.id, step_no: 1, after_minutes: 0, channel: 'email' };
    expect((await expectError(insertOne(s.a, 'escalation_policy_steps', step))).message).toMatch(/escalation_policy_steps_exactly_one_target/);
    const both = { ...step, recipient_group_id: g.id, on_call_schedule_id: sched.id };
    expect((await expectError(insertOne(s.a, 'escalation_policy_steps', both))).message).toMatch(/escalation_policy_steps_exactly_one_target/);
    await insertOne(s.a, 'escalation_policy_steps', { ...step, recipient_group_id: g.id });
    const dup = await expectError(insertOne(s.a, 'escalation_policy_steps', { ...step, on_call_schedule_id: sched.id }));
    expect(dup.message).toMatch(/escalation_policy_steps_organization_id_policy_id_step_no_key|Uniqueness/i);
    const neg = await expectError(insertOne(s.a, 'escalation_policy_steps', { ...step, step_no: 2, after_minutes: -1, on_call_schedule_id: sched.id }));
    expect(neg.message).toMatch(/escalation_policy_steps_after_minutes_nonnegative/);
    const zero = await expectError(insertOne(s.a, 'escalation_policy_steps', { ...step, step_no: 0, on_call_schedule_id: sched.id }));
    expect(zero.message).toMatch(/escalation_policy_steps_step_no_positive/);
    await insertOne(s.a, 'escalation_policy_steps', { ...step, step_no: 2, after_minutes: 15, on_call_schedule_id: sched.id });
  });

  it('should cascade steps with the policy', async () => {
    const s = await setup();
    const policy = await insertOne(s.a, 'escalation_policies', { name: 'p' });
    const g = await group(s.a);
    await insertOne(s.a, 'escalation_policy_steps', { policy_id: policy.id, step_no: 1, after_minutes: 5, recipient_group_id: g.id, channel: 'sms' });
    await deleteByPk(s.a, 'escalation_policies', policy.id);
    const [left] = await runSqlRows(`select count(*) n from itap.escalation_policy_steps where policy_id='${policy.id}'`);
    expect(left.n).toBe('0');
  });

  it('should SET NULL on incidents and block deleting a policy used by a rule version', async () => {
    const s = await setup();
    const used = await insertOne(s.a, 'escalation_policies', { name: 'used-by-incident' });
    const pinned = await insertOne(s.a, 'escalation_policies', { name: 'used-by-version' });
    const incident = await insertOne(s.a, 'incidents', { title: 'T', escalation_policy_id: used.id });
    await deleteByPk(s.a, 'escalation_policies', used.id);
    const [inc] = await runSqlRows(`select escalation_policy_id from itap.incidents where id='${incident.id}'`);
    expect(inc.escalation_policy_id).toBe('NULL');
    const rule = await insertOne(s.a, 'event_rules', { name: 'r', rule_type: 'loitering' });
    await insertOne(s.a, 'event_rule_versions', { rule_id: rule.id, escalation_policy_id: pinned.id });
    const err = await expectError(deleteByPk(s.a, 'escalation_policies', pinned.id));
    expect(err.message).toMatch(FK);
  });

  it('should not reference a policy of another organization', async () => {
    const s = await setup();
    const foreign = await insertOne(s.b, 'escalation_policies', { name: 'foreign' });
    const err = await expectError(insertOne(s.a, 'incidents', { title: 'T', escalation_policy_id: foreign.id }));
    expect(err.message).toMatch(FK);
  });
});

describe('notification rules', () => {
  it('should assign NRULE codes, default flags and validate conditions as an object', async () => {
    const s = await setup();
    const rule = await insertOne<{ code: string; priority: string; is_active: boolean; digest_mode: string; last_triggered_at: string | null }>(
      s.a, 'notification_rules', { name: 'r1' }, 'code priority is_active digest_mode last_triggered_at',
    );
    expect(rule).toMatchObject({ code: 'NRULE-00001', priority: 'medium', is_active: true, digest_mode: 'none', last_triggered_at: null });
    const second = await insertOne<{ code: string }>(s.a, 'notification_rules', { name: 'r2', conditions: { min_severity: 'high' } }, 'code');
    expect(second.code).toBe('NRULE-00002');
    const arr = await expectError(insertOne(s.a, 'notification_rules', { name: 'r3', conditions: [1] }));
    expect(arr.message).toMatch(/notification_rules_conditions_object/);
    const prio = await expectError(insertOne(s.a, 'notification_rules', { name: 'r4', priority: 'urgent' }));
    expect(prio.message).toMatch(FK);
    const mode = await expectError(insertOne(s.a, 'notification_rules', { name: 'r5', digest_mode: 'weekly' }));
    expect(mode.message).toMatch(FK);
  });

  it('should keep last_triggered_at and code read-only', async () => {
    const s = await setup();
    await expectDenied(insertOne(s.a, 'notification_rules', { name: 'x', last_triggered_at: '2026-01-01T00:00:00Z' }), 'last_triggered_at');
    await expectDenied(insertOne(s.a, 'notification_rules', { name: 'y', code: 'NRULE-9' }), 'code');
  });

  it('should link event types and channels once, and reject unknown ones', async () => {
    const s = await setup();
    const rule = await insertOne(s.a, 'notification_rules', { name: 'r' });
    await insertOne(s.a, 'notification_rule_event_types', { rule_id: rule.id, event_type: 'blacklist_match' });
    const dup = await expectError(insertOne(s.a, 'notification_rule_event_types', { rule_id: rule.id, event_type: 'blacklist_match' }));
    expect(dup.message).toMatch(/Uniqueness|unique/i);
    expect((await expectError(insertOne(s.a, 'notification_rule_event_types', { rule_id: rule.id, event_type: 'nope' }))).message).toMatch(FK);
    await insertOne(s.a, 'notification_rule_channels', { rule_id: rule.id, channel: 'email' });
    expect((await expectError(insertOne(s.a, 'notification_rule_channels', { rule_id: rule.id, channel: 'fax' }))).message).toMatch(FK);
    await deleteByPk(s.a, 'notification_rules', rule.id);
    const [left] = await runSqlRows(`select (select count(*) from itap.notification_rule_channels where rule_id='${rule.id}') c`);
    expect(left.c).toBe('0');
  });

  it('should reference group, template and policy of the own organization only; SET NULL on template and policy delete', async () => {
    const s = await setup();
    const g = await group(s.a);
    const tpl = await insertOne(s.a, 'notification_templates', { name: 't', channel: 'in_app', locale: 'en', body: 'b' });
    const pol = await insertOne(s.a, 'escalation_policies', { name: 'p' });
    const rule = await insertOne(s.a, 'notification_rules', { name: 'r', recipient_group_id: g.id, template_id: tpl.id, escalation_policy_id: pol.id });
    const foreign = await group(s.b, 'foreign');
    expect((await expectError(insertOne(s.a, 'notification_rules', { name: 'r2', recipient_group_id: foreign.id }))).message).toMatch(FK);
    await deleteByPk(s.a, 'notification_templates', tpl.id);
    await deleteByPk(s.a, 'escalation_policies', pol.id);
    const [row] = await runSqlRows(`select template_id, escalation_policy_id, recipient_group_id from itap.notification_rules where id='${rule.id}'`);
    expect(row).toEqual({ template_id: 'NULL', escalation_policy_id: 'NULL', recipient_group_id: g.id });
    expect((await expectError(deleteByPk(s.a, 'recipient_groups', g.id))).message).toMatch(FK);
  });
});

describe('notification subscriptions', () => {
  it('should preset user_id from the session and be visible to the owner only', async () => {
    const s = await setup();
    const mate = await createTestUser();
    await addMember(s.orgA.id, mate.id);
    const sub = await insertOne<{ user_id: string; min_severity: string }>(
      s.a, 'notification_subscriptions', { event_type: 'blacklist_match', channel: 'in_app' }, 'user_id min_severity',
    );
    expect(sub.user_id).toBe(s.user.id);
    expect(sub.min_severity).toBe('info');
    const mateClient = asOrgAdmin(mate.id, s.orgA.id);
    const seen = await mateClient.request<{ notification_subscriptions: unknown[] }>(`query { notification_subscriptions { id } }`);
    expect(seen.notification_subscriptions).toEqual([]);
    const mine = await insertOne(mateClient, 'notification_subscriptions', { facility_id: null, event_type: 'device_offline', channel: 'email' });
    const id = (await insertOne(s.a, 'notification_subscriptions', { event_type: 'vip_arrival', channel: 'push' })).id;
    expect(await updateByPk(mateClient, 'notification_subscriptions', id, { channel: 'sms' })).toBeNull();
    expect(await deleteByPk(mateClient, 'notification_subscriptions', id)).toBeNull();
    expect(await updateByPk(s.a, 'notification_subscriptions', id, { channel: 'sms' })).not.toBeNull();
    expect(await deleteByPk(mateClient, 'notification_subscriptions', mine.id)).not.toBeNull();
  });

  it('should not let the caller choose the user and should isolate organizations', async () => {
    const s = await setup();
    await expectDenied(insertOne(s.a, 'notification_subscriptions', { user_id: s.other.id, event_type: 'x', channel: 'email' }), 'user_id');
    const mine = await insertOne(s.a, 'notification_subscriptions', { event_type: 'tailgating', channel: 'email' });
    const seen = await s.b.request<{ notification_subscriptions: unknown[] }>(`query { notification_subscriptions { id } }`);
    expect(seen.notification_subscriptions).toEqual([]);
    await expectDenied(updateByPk(s.a, 'notification_subscriptions', mine.id, { user_id: s.other.id }), 'user_id');
  });

  it('should require at least one filter and accept each filter kind', async () => {
    const s = await setup();
    const none = await expectError(insertOne(s.a, 'notification_subscriptions', { channel: 'email' }));
    expect(none.message).toMatch(/notification_subscriptions_needs_filter/);
    const sevOnly = await expectError(insertOne(s.a, 'notification_subscriptions', { channel: 'email', min_severity: 'high' }));
    expect(sevOnly.message).toMatch(/notification_subscriptions_needs_filter/);
    const facility = await insertOne(s.a, 'facilities', { name: 'F', timezone: 'UTC' });
    const list = await insertOne(s.a, 'watch_lists', { name: 'W', kind: 'watch' });
    await insertOne(s.a, 'notification_subscriptions', { facility_id: facility.id, channel: 'email', min_severity: 'high' });
    await insertOne(s.a, 'notification_subscriptions', { watch_list_id: list.id, channel: 'in_app' });
    expect((await expectError(insertOne(s.a, 'notification_subscriptions', { event_type: 'nope', channel: 'email' }))).message).toMatch(FK);
    expect((await expectError(insertOne(s.a, 'notification_subscriptions', { event_type: 'tailgating', channel: 'email', min_severity: 'severe' }))).message).toMatch(FK);
    const foreignFacility = await insertOne(s.b, 'facilities', { name: 'FB', timezone: 'UTC' });
    expect((await expectError(insertOne(s.a, 'notification_subscriptions', { facility_id: foreignFacility.id, channel: 'email' }))).message).toMatch(FK);
  });

  it('should reject the webhook channel (webhooks have their own subscriptions)', async () => {
    const s = await setup();
    const err = await expectError(insertOne(s.a, 'notification_subscriptions', { event_type: 'tailgating', channel: 'webhook' }));
    expect(err.message).toMatch(/notification_subscriptions_channel_not_webhook/);
  });

  it('should refuse a deactivated owner for new subscriptions and cascade with the watched facility', async () => {
    const s = await setup();
    const facility = await insertOne(s.a, 'facilities', { name: 'F2', timezone: 'UTC' });
    const sub = await insertOne(s.a, 'notification_subscriptions', { facility_id: facility.id, channel: 'email' });
    await runSqlRows(`update itap.organization_members set status='deactivated', deactivated_at=now() where organization_id='${s.orgA.id}' and user_id='${s.user.id}'`);
    await expect(
      runSqlRows(`insert into itap.notification_subscriptions (organization_id, user_id, event_type, channel) values ('${s.orgA.id}','${s.user.id}','tailgating','email')`),
    ).rejects.toThrow(/member_not_active:user_id/);
    await runSqlRows(`delete from itap.facilities where id='${facility.id}'`);
    const [left] = await runSqlRows(`select count(*) n from itap.notification_subscriptions where id='${sub.id}'`);
    expect(left.n).toBe('0');
  });
});

describe('audit', () => {
  it('should write audit rows for config changes', async () => {
    const s = await setup();
    const g = await group(s.a, 'Audited');
    const [row] = await runSqlRows(
      `select count(*) n from itap.audit_log where organization_id='${s.orgA.id}' and entity_id='${g.id}'`,
    );
    expect(Number(row.n)).toBeGreaterThanOrEqual(1);
  });
});
