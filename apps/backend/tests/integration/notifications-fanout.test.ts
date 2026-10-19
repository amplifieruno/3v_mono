import { describe, expect, it } from 'vitest';
import { asAdmin } from './support/clients.js';
import { createDevice, createFacility } from './support/facilities.js';
import { expectError } from './support/fixtures.js';
import {
  fanOutAgain,
  member,
  notificationRule,
  notificationWorld,
  orgDeliveries,
  orgInbox,
  recipientGroup,
  recipients,
  setMember,
  unknownArrival,
} from './support/notifications.js';
import { insertOne, updateByPk } from './support/operations.js';
import { evaluate, listEntry, orgEvents, orgIncidents, publishedRule } from './support/stageB.js';
import { at, createIdentity, detect } from './support/tracking.js';

describe('Stage C: rule fan-out', () => {
  it('should not duplicate deliveries or inbox rows when an event is redelivered (Review Focus 1)', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.user.id, channel: 'in_app' },
      { user_id: w.bob, channel: 'email' },
      { external_address: 'guard@example.com', channel: 'email' },
    ]);
    await notificationRule(w.a, ['detection_unknown'], ['in_app', 'email'], { recipient_group_id: group });
    const d = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await Promise.all([evaluate(d.id), evaluate(d.id)]);
    await evaluate(d.id);
    const [event] = await orgEvents(w.orgA.id);
    await fanOutAgain(w.orgA.id, [event.id]);
    await fanOutAgain(w.orgA.id, [event.id]);
    const deliveries = await orgDeliveries(w.orgA.id);
    expect(recipients(deliveries)).toEqual(
      [['email', 'guard@example.com'], ['email', w.bob], ['in_app', w.user.id]].sort((x, y) => x.join().localeCompare(y.join())),
    );
    expect(await orgInbox(w.orgA.id)).toHaveLength(1);
  });

  it('should deliver in_app at once into the inbox and leave other channels pending', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [
      { user_id: w.user.id, channel: 'in_app' },
      { user_id: w.user.id, channel: 'email' },
    ]);
    const rule = await notificationRule(w.a, ['detection_unknown'], ['in_app', 'email'], { recipient_group_id: group, priority: 'high' });
    const event = await unknownArrival(w);
    const deliveries = await orgDeliveries(w.orgA.id);
    const email = deliveries.find((x) => x.channel === 'email');
    const inApp = deliveries.find((x) => x.channel === 'in_app');
    expect(email).toMatchObject({ rule_id: rule, event_id: event.id, priority: 'high', deliver_after: null });
    // Written pending; the send_delivery trigger (task 3) may already have sent it.
    expect(['pending', 'sent']).toContain(email?.status);
    expect(inApp).toMatchObject({ status: 'delivered', priority: 'high' });
    expect(inApp?.delivered_at).not.toBeNull();
    const [inbox] = await orgInbox(w.orgA.id);
    expect(inbox).toMatchObject({ user_id: w.user.id, delivery_id: inApp?.id, event_id: event.id, priority: 'high', read_at: null });
    expect(inbox.title).toContain(event.title);
  });

  it('should skip deactivated and expired members and route vacations to the delegate (Review Focus 2)', async () => {
    const w = await notificationWorld();
    const [gone, expired, away, awayAlone] = await Promise.all([
      member(w.orgA.id), member(w.orgA.id), member(w.orgA.id), member(w.orgA.id),
    ]);
    const group = await recipientGroup(w.a, [gone, expired, away, awayAlone, w.bob].map((user_id) => ({ user_id, channel: 'in_app' })));
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], { recipient_group_id: group });
    await setMember(w.orgA.id, gone, `status = 'deactivated', deactivated_at = now()`);
    await setMember(w.orgA.id, expired, `expires_at = '${at(-60)}'`);
    await setMember(w.orgA.id, away, `vacation_until = '${at(86400)}', vacation_delegate_user_id = '${w.carol}'`);
    await setMember(w.orgA.id, awayAlone, `vacation_until = '${at(86400)}'`);
    await unknownArrival(w);
    expect(recipients(await orgDeliveries(w.orgA.id))).toEqual(
      [['in_app', awayAlone], ['in_app', w.bob], ['in_app', w.carol]].sort((x, y) => x.join().localeCompare(y.join())),
    );
    expect((await orgInbox(w.orgA.id)).map((n) => n.user_id).sort()).toEqual([awayAlone, w.bob, w.carol].sort());
    // A vacation that ended before the event does not delegate.
    await setMember(w.orgA.id, away, `vacation_until = '${at(500)}'`);
    await unknownArrival(w, 1000, await createIdentity(w.a));
    expect((await orgDeliveries(w.orgA.id)).filter((x) => x.recipient_user_id === away)).toHaveLength(1);
  });

  it('should defer email in quiet hours but never in_app or critical deliveries (Review Focus 5)', async () => {
    const w = await notificationWorld();
    // at(0) = Monday 2026-01-05 08:00 UTC = 17:00 in Tokyo (organization timezone).
    await asAdmin().request(`mutation($id: uuid!) { update_organizations_by_pk(pk_columns: {id: $id}, _set: {timezone: "Asia/Tokyo"}) { id } }`, {
      id: w.orgA.id,
    });
    await setMember(w.orgA.id, w.bob, `quiet_hours = '[{"days":[1],"from":"16:00","to":"18:30"}]'`);
    const group = await recipientGroup(w.a, [
      { user_id: w.bob, channel: 'email' },
      { user_id: w.bob, channel: 'in_app' },
      { user_id: w.carol, channel: 'email' },
    ]);
    const normal = await notificationRule(w.a, ['detection_unknown'], ['in_app', 'email'], { recipient_group_id: group });
    const critical = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group, priority: 'critical' });
    await unknownArrival(w);
    const rows = await orgDeliveries(w.orgA.id);
    const of = (rule: string, user: string, channel: string) =>
      rows.find((x) => x.rule_id === rule && x.recipient_user_id === user && x.channel === channel);
    expect(Date.parse(of(normal, w.bob, 'email')?.deliver_after ?? '')).toBe(Date.parse('2026-01-05T09:30:00Z'));
    expect(of(normal, w.bob, 'in_app')).toMatchObject({ status: 'delivered', deliver_after: null });
    // Not deferred (the event time is in the past, so even the deferred row is due and may already be sent).
    expect(of(normal, w.carol, 'email')).toMatchObject({ deliver_after: null });
    expect(of(critical, w.bob, 'email')).toMatchObject({ deliver_after: null });
  });

  it('should match event type, conditions and activity; a rule without a group delivers nothing', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const other = await createFacility(w.a);
    const fire = async (fields: Record<string, unknown>, eventTypes = ['detection_unknown']) =>
      notificationRule(w.a, eventTypes, ['in_app'], { recipient_group_id: group, ...fields });
    const byFacility = await fire({ conditions: { facility_id: w.facility.id } });
    const byAncestor = await fire({ conditions: { area_id: w.building.id } });
    await fire({ conditions: { facility_id: other.id } });
    await fire({ conditions: { area_id: w.zone.id } });
    await fire({ conditions: { min_severity: 'low' } });
    await fire({ is_active: false });
    await fire({}, ['blacklist_match']);
    await notificationRule(w.a, ['detection_unknown'], ['in_app']);
    await fire({}, ['detection_unknown']).then((id) => updateByPk(w.a, 'notification_rules', id, { recipient_group_id: null }));
    const emailOnly = await notificationRule(w.a, ['detection_unknown'], ['email'], { recipient_group_id: group });
    await unknownArrival(w);
    const rules = (await orgDeliveries(w.orgA.id)).map((x) => x.rule_id).sort();
    expect(rules).toEqual([byFacility, byAncestor].sort());
    expect(rules).not.toContain(emailOnly);
  });

  it('should validate rule conditions (keys, severity, ids of the organization)', async () => {
    const w = await notificationWorld();
    const bad = async (conditions: unknown) =>
      (await expectError(notificationRule(w.a, ['detection_unknown'], ['in_app'], { conditions }))).message;
    expect(await bad({ camera: 'x' })).toMatch(/notification_rule_conditions_invalid/);
    expect(await bad({ min_severity: 'extreme' })).toMatch(/notification_rule_conditions_invalid/);
    expect(await bad({ facility_id: 'not-a-uuid' })).toMatch(/notification_rule_conditions_invalid/);
    expect(await bad({ facility_id: '00000000-0000-0000-0000-000000000001' })).toMatch(/notification_rule_conditions_invalid/);
    const second = await createFacility(w.a);
    expect(await bad({ facility_id: second.id, area_id: w.lobby.id })).toMatch(/notification_rule_conditions_invalid/);
    await notificationRule(w.a, ['detection_unknown'], ['in_app'], {
      conditions: { facility_id: w.facility.id, area_id: w.lobby.id, min_severity: 'high' },
    });
  });

  it('should stamp last_triggered_at with the event time without touching updated_at, and link the incident', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    const list = await insertOne(w.a, 'watch_lists', { name: 'Banned', kind: 'blacklist', severity: 'critical' });
    await listEntry(w.a, { watch_list_id: list.id, identity_id: w.identity });
    await publishedRule(w.a, 'watchlist', { creates_incident: true });
    const rule = await notificationRule(w.a, ['blacklist_match'], ['in_app'], { recipient_group_id: group, priority: 'critical' });
    const state = async () =>
      (
        await asAdmin().request<{ notification_rules_by_pk: { last_triggered_at: string | null; updated_at: string } }>(
          `query($id: uuid!) { notification_rules_by_pk(id: $id) { last_triggered_at updated_at } }`,
          { id: rule },
        )
      ).notification_rules_by_pk;
    const before = await state();
    const d = await detect(w.orgA.id, w.lobbyCam, w.identity, 0);
    await evaluate(d.id);
    const after = await state();
    expect(Date.parse(after.last_triggered_at ?? '')).toBe(Date.parse(d.detected_at));
    expect(after.updated_at).toBe(before.updated_at);
    const [incident] = await orgIncidents(w.orgA.id);
    const [delivery] = await orgDeliveries(w.orgA.id);
    expect(delivery).toMatchObject({ incident_id: incident.id, priority: 'critical' });
    expect((await orgInbox(w.orgA.id))[0].incident_id).toBe(incident.id);
  });

  it('should fan out device events written by record_device_health', async () => {
    const w = await notificationWorld();
    const group = await recipientGroup(w.a, [{ user_id: w.bob, channel: 'in_app' }]);
    await notificationRule(w.a, ['device_offline'], ['in_app'], { recipient_group_id: group });
    const device = await createDevice(w.a, w.facility.id, { area_id: w.lobby.id, stream_url: 'rtsp://mediamtx:8554/x' });
    const record = (reachable: boolean, s: number) =>
      asAdmin().request(
        `mutation($d: uuid!, $r: Boolean!, $t: timestamptz!) {
          record_device_health(args: {p_device: $d, p_reachable: $r, p_latency_ms: 5, p_frame_ok: $r, p_checked_at: $t}) { id } }`,
        { d: device.id, r: reachable, t: at(s) },
      );
    await record(true, 0);
    await record(false, 60);
    await record(false, 60);
    const deliveries = await orgDeliveries(w.orgA.id);
    expect(deliveries).toHaveLength(1);
    expect((await orgInbox(w.orgA.id))[0].title).toMatch(/offline/i);
  });
});
