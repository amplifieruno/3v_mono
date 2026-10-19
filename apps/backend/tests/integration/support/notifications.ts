import type { HasuraClient } from '../../../src/hasura/client.js';
import { asAdmin } from './clients.js';
import { addMember, createTestUser, type MemberStatus } from './fixtures.js';
import { insertOne } from './operations.js';
import { runSql } from './sql.js';
import { evaluate, type EventRow } from './stageB.js';
import { createTrackingWorld, detect, type World } from './tracking.js';

/** Stage C (notification fan-out) fixtures: slice 5, task 2. */

export type Delivery = {
  id: string;
  rule_id: string | null;
  subscription_id: string | null;
  escalation_step_id: string | null;
  event_id: string | null;
  incident_id: string | null;
  recipient_user_id: string | null;
  recipient_address: string | null;
  channel: string;
  priority: string;
  status: string;
  deliver_after: string | null;
  delivered_at: string | null;
  acknowledged_at: string | null;
  content: { subject?: string | null; body?: string; title?: string; template_id?: string | null };
};
const DELIVERY_FIELDS = `id rule_id subscription_id escalation_step_id event_id incident_id recipient_user_id
  recipient_address channel priority status deliver_after delivered_at acknowledged_at content`;

export type InboxRow = {
  id: string;
  user_id: string;
  delivery_id: string | null;
  event_id: string | null;
  incident_id: string | null;
  title: string;
  body: string;
  priority: string;
  read_at: string | null;
  acknowledged_at: string | null;
};
export const INBOX_FIELDS = 'id user_id delivery_id event_id incident_id title body priority read_at acknowledged_at';

/** A tracking world plus extra active members (bob, carol) of org A. */
export async function notificationWorld(): Promise<World & { bob: string; carol: string }> {
  const w = await createTrackingWorld();
  const [bob, carol] = await Promise.all([member(w.orgA.id), member(w.orgA.id)]);
  return { ...w, bob, carol };
}

/** A new user who is a member of `orgId` with `status`. */
export async function member(orgId: string, status: MemberStatus = 'active'): Promise<string> {
  const user = await createTestUser();
  await addMember(orgId, user.id, status);
  return user.id;
}

/** Updates an organization member with raw SQL (quiet hours, vacation, status). */
export async function setMember(orgId: string, userId: string, set: string): Promise<void> {
  await runSql(`update itap.organization_members set ${set} where organization_id = '${orgId}' and user_id = '${userId}'`);
}

/** A recipient group with members: `{ user_id | external_address, channel }`. */
export async function recipientGroup(a: HasuraClient, members: Record<string, unknown>[], name?: string): Promise<string> {
  const g = await insertOne(a, 'recipient_groups', {
    name: name ?? `Group ${Math.random().toString(36).slice(2, 10)}`,
    recipient_group_members: { data: members },
  });
  return g.id;
}

/** An active notification rule firing on `eventTypes` over `channels`. */
export async function notificationRule(
  a: HasuraClient,
  eventTypes: string[],
  channels: string[],
  fields: Record<string, unknown> = {},
): Promise<string> {
  const r = await insertOne(a, 'notification_rules', {
    name: `Rule ${Math.random().toString(36).slice(2, 10)}`,
    notification_rule_event_types: { data: eventTypes.map((event_type) => ({ event_type })) },
    notification_rule_channels: { data: channels.map((channel) => ({ channel })) },
    ...fields,
  });
  return r.id;
}

/** One detection of a fresh unknown identity in the lobby at `seconds` -> detection_unknown (info). */
export async function unknownArrival(w: World, seconds = 0, identity = w.identity): Promise<EventRow> {
  const events = await evaluate((await detect(w.orgA.id, w.lobbyCam, identity, seconds)).id);
  const event = events.find((e) => e.event_type === 'detection_unknown');
  if (!event) throw new Error('unknownArrival: no detection_unknown event');
  return event;
}

export async function orgDeliveries(orgId: string): Promise<Delivery[]> {
  const data = await asAdmin().request<{ notification_deliveries: Delivery[] }>(
    `query($o: uuid!) { notification_deliveries(where: {organization_id: {_eq: $o}},
      order_by: [{channel: asc}, {recipient_user_id: asc}, {recipient_address: asc}]) { ${DELIVERY_FIELDS} } }`,
    { o: orgId },
  );
  return data.notification_deliveries;
}

export async function orgInbox(orgId: string): Promise<InboxRow[]> {
  const data = await asAdmin().request<{ user_notifications: InboxRow[] }>(
    `query($o: uuid!) { user_notifications(where: {organization_id: {_eq: $o}}, order_by: {created_at: asc}) { ${INBOX_FIELDS} } }`,
    { o: orgId },
  );
  return data.user_notifications;
}

/** Re-runs Stage C for already written events (what a redelivered writer would do). */
export async function fanOutAgain(orgId: string, eventIds: string[]): Promise<void> {
  await runSql(`select itap.fan_out_events('${orgId}', array[${eventIds.map((id) => `'${id}'::uuid`).join(',')}])`);
}

/** [channel, recipient] pairs of deliveries, sorted, for compact assertions. */
export const recipients = (rows: Delivery[]): string[][] =>
  rows.map((d) => [d.channel, d.recipient_user_id ?? d.recipient_address ?? '']).sort((x, y) => x.join().localeCompare(y.join()));
