import { describe, expect, it } from 'vitest';
import { asOrgAdmin } from './support/clients.js';
import { expectDenied, expectError } from './support/fixtures.js';
import {
  INBOX_FIELDS,
  member,
  notificationRule,
  notificationWorld,
  orgDeliveries,
  orgInbox,
  recipientGroup,
  setMember,
  unknownArrival,
  type InboxRow,
} from './support/notifications.js';
import { callFn, insertOne, updateByPk } from './support/operations.js';
import { runSqlRows } from './support/sql.js';
import { evaluate, listEntry } from './support/stageB.js';
import { createIdentity, detect } from './support/tracking.js';

const inboxOf = async (client: ReturnType<typeof asOrgAdmin>): Promise<InboxRow[]> =>
  (await client.request<{ user_notifications: InboxRow[] }>(`query { user_notifications { ${INBOX_FIELDS} } }`)).user_notifications;

describe('in-app inbox', () => {
  it('should show each member only their own notifications and let only the owner read and acknowledge them', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [w.user.id, w.bob].map((user_id) => ({ user_id, channel: 'in_app' })));
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await unknownArrival(w);
    const bob = asOrgAdmin(w.bob, w.orgA.id);
    const mine = await inboxOf(w.a);
    expect(mine.map((n) => n.user_id)).toEqual([w.user.id]);
    const bobs = await inboxOf(bob);
    expect(bobs.map((n) => n.user_id)).toEqual([w.bob]);
    // Another member's notification: not visible, not updatable, not acknowledgeable.
    expect(await updateByPk(bob, 'user_notifications', mine[0].id, { read_at: 'now()' })).toBeNull();
    expect((await expectError(callFn(bob, 'acknowledge_notification', { p_notification: mine[0].id }, 'id'))).message).toMatch(
      /notification_not_found/,
    );
    await expectDenied(updateByPk(w.a, 'user_notifications', mine[0].id, { title: 'x' }), 'title');
    await expectDenied(insertOne(w.a, 'user_notifications', { title: 'x' }), 'insert_user_notifications_one');
    // The owner acknowledges: inbox row and delivery carry the time; read_at follows.
    const acked = await callFn<InboxRow>(w.a, 'acknowledge_notification', { p_notification: mine[0].id }, INBOX_FIELDS);
    expect(acked.acknowledged_at).not.toBeNull();
    expect(acked.read_at).not.toBeNull();
    const again = await callFn<InboxRow>(w.a, 'acknowledge_notification', { p_notification: mine[0].id }, INBOX_FIELDS);
    expect(again.acknowledged_at).toBe(acked.acknowledged_at);
    const delivery = (await orgDeliveries(w.orgA.id)).find((d) => d.id === mine[0].delivery_id);
    expect(delivery?.acknowledged_at).not.toBeNull();
    // mark_notifications_read only touches the caller's rows.
    const read = await bob.request<{ mark_notifications_read: InboxRow[] }>(
      `mutation($ids: _uuid!) { mark_notifications_read(args: {p_ids: $ids}) { id read_at } }`,
      { ids: `{${bobs[0].id},${mine[0].id}}` },
    );
    expect(read.mark_notifications_read.map((n) => n.id)).toEqual([bobs[0].id]);
    expect(read.mark_notifications_read[0].read_at).not.toBeNull();
    // Owner may mark unread again through the update permission.
    const unread = await updateByPk<{ read_at: string | null }>(bob, 'user_notifications', bobs[0].id, { read_at: null }, 'read_at');
    expect(unread?.read_at).toBeNull();
  });

  it('should keep deliveries read-only for org_admin and isolate organizations', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.user.id, channel: 'in_app' }]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await unknownArrival(w);
    const seen = await w.a.request<{ notification_deliveries: { id: string }[] }>(`query { notification_deliveries { id } }`);
    expect(seen.notification_deliveries).toHaveLength(1);
    await expectDenied(
      updateByPk(w.a, 'notification_deliveries', seen.notification_deliveries[0].id, { status: 'failed' }),
      'update_notification_deliveries_by_pk',
    );
    const b = asOrgAdmin(w.other.id, w.orgB.id);
    expect((await b.request<{ notification_deliveries: unknown[] }>(`query { notification_deliveries { id } }`)).notification_deliveries).toEqual([]);
    expect(await inboxOf(b)).toEqual([]);
  });
});

describe('subscriptions', () => {
  it('should deliver matching subscriptions of active owners once per event', async () => {
    const w = await notificationWorld();
    const bob = asOrgAdmin(w.bob, w.orgA.id);
    const carol = asOrgAdmin(w.carol, w.orgA.id);
    const typeSub = await insertOne(bob, 'notification_subscriptions', { event_type: 'detection_unknown', facility_id: w.facility.id, channel: 'in_app' });
    await insertOne(bob, 'notification_subscriptions', { event_type: 'detection_unknown', channel: 'email', min_severity: 'high' });
    await insertOne(bob, 'notification_subscriptions', { event_type: 'blacklist_match', channel: 'in_app' });
    const idSub = await insertOne(w.a, 'notification_subscriptions', { identity_id: w.identity, channel: 'email' });
    await insertOne(carol, 'notification_subscriptions', { event_type: 'detection_unknown', channel: 'in_app' });
    await setMember(w.orgA.id, w.carol, `status = 'suspended'`);
    const event = await unknownArrival(w);
    const rows = await orgDeliveries(w.orgA.id);
    expect(rows.map((d) => [d.subscription_id, d.recipient_user_id, d.channel, d.event_id]).sort()).toEqual(
      [
        [typeSub.id, w.bob, 'in_app', event.id],
        [idSub.id, w.user.id, 'email', event.id],
      ].sort(),
    );
    expect(rows.find((d) => d.channel === 'in_app')).toMatchObject({ status: 'delivered', priority: 'low' });
    expect((await orgInbox(w.orgA.id)).map((n) => n.user_id)).toEqual([w.bob]);
    // Subscriptions are private: other admins do not see their deliveries either (rule deliveries stay visible).
    const visible = await bob.request<{ notification_deliveries: { subscription_id: string }[] }>(
      `query { notification_deliveries { subscription_id } }`,
    );
    expect(visible.notification_deliveries).toEqual([{ subscription_id: typeSub.id }]);
  });

  it('should match watch-list subscriptions by the list of the event', async () => {
    const w = await notificationWorld();
    const list = await insertOne(w.a, 'watch_lists', { name: 'Banned', kind: 'blacklist', severity: 'critical' });
    const otherList = await insertOne(w.a, 'watch_lists', { name: 'VIP', kind: 'vip', severity: 'low' });
    await listEntry(w.a, { watch_list_id: list.id, identity_id: w.identity });
    const hit = await insertOne(w.a, 'notification_subscriptions', { watch_list_id: list.id, channel: 'in_app', min_severity: 'critical' });
    await insertOne(w.a, 'notification_subscriptions', { watch_list_id: otherList.id, channel: 'in_app' });
    await evaluate((await detect(w.orgA.id, w.lobbyCam, w.identity, 0)).id);
    const rows = await orgDeliveries(w.orgA.id);
    expect(rows.map((d) => [d.subscription_id, d.priority])).toEqual([[hit.id, 'critical']]);
  });
});

describe('templates and rendering', () => {
  it('should replace placeholders once, blank unknown ones and keep other text', async () => {
    const [row] = await runSqlRows(
      `select itap.render_template('Hi {{ name }}, {{missing}}{{x.y}} {{name}}!', '{"name":"{{x.y}}","x.y":"no"}') r,
              itap.render_template(null, '{}') n`,
    );
    expect(row).toEqual({ r: 'Hi {{x.y}}, no {{x.y}}!', n: 'NULL' });
  });

  it('should render the template of the delivery channel by name, else a fallback text', async () => {
    const w = await notificationWorld();
    const fields = { name: 'arrival', locale: 'en' };
    const email = await insertOne(w.a, 'notification_templates', {
      ...fields, channel: 'email', subject: '[{{severity}}] {{event_title}}', body: '{{event_title}} in {{area}} of {{facility}} at {{occurred_at}} ({{identity_code}})',
    });
    await insertOne(w.a, 'notification_templates', { ...fields, channel: 'in_app', body: 'Inbox: {{event_title}} / {{rule_name}}' });
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'email' },
      { user_id: w.bob, channel: 'in_app' },
      { user_id: w.bob, channel: 'sms' },
    ]);
    await notificationRule(w.a, ['detection_unknown'], ['email', 'in_app', 'sms'], { recipient_group_id: group, template_id: email.id, name: 'Arrivals' });
    const event = await unknownArrival(w);
    const [identity] = await runSqlRows(`select code from itap.identities where id = '${w.identity}'`);
    const rows = await orgDeliveries(w.orgA.id);
    const by = (channel: string) => rows.find((d) => d.channel === channel)?.content;
    expect(by('email')).toMatchObject({
      template_id: email.id,
      subject: `[info] ${event.title}`,
      body: `${event.title} in Lobby of ${w.facility.name} at 2026-01-05 08:00 UTC (${identity.code})`,
    });
    expect(by('in_app')?.body).toBe(`Inbox: ${event.title} / Arrivals`);
    expect(by('sms')).toMatchObject({ template_id: null, subject: `[info] ${event.title}` });
    expect(by('sms')?.body).toContain(event.title);
    const [inbox] = await orgInbox(w.orgA.id);
    expect(inbox.body).toBe(`Inbox: ${event.title} / Arrivals`);
  });

  it('should not deliver to a member deactivated after a group was configured, via subscriptions either', async () => {
    const w = await notificationWorld();
    const gone = await member(w.orgA.id);
    await insertOne(asOrgAdmin(gone, w.orgA.id), 'notification_subscriptions', { event_type: 'detection_unknown', channel: 'in_app' });
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    await unknownArrival(w, 0, await createIdentity(w.a));
    expect(await orgDeliveries(w.orgA.id)).toEqual([]);
  });
});
