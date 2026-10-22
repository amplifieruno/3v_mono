import { defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  EVENT_RESOURCE,
  NOTIFICATION_RULE_CHANNEL_RESOURCE,
  NOTIFICATION_RULE_EVENT_TYPE_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  RECIPIENT_GROUP_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';

/** The registry key the notification operations are bound under. */
export const NOTIFICATIONS_BINDING = 'notifications';

/** How many of the latest events a test reads by default, and the choices offered (the function takes 1–100). */
export const TEST_LIMITS = [20, 50, 100] as const;

/** One recipient a match would notify: a member (`user_id`) or an external address, on a channel. */
export const testRecipient = z.object({
  channel: z.string(),
  user_id: z.string().nullable(),
  address: z.string().nullable(),
});

/** One event of `test_notification_rule` (`itap_results.notification_rule_tests`). */
export const testRow = z.object({
  event_id: z.string(),
  event_type: z.string(),
  severity: z.string(),
  occurred_at: z.string(),
  title: z.string(),
  would_match: z.boolean(),
  /** `match`, `event_type_mismatch` or `condition_mismatch`. */
  reason: z.string(),
  recipient_count: z.number(),
  recipients: z.array(testRecipient),
});

export type TestRow = z.infer<typeof testRow>;
export type TestRecipient = z.infer<typeof testRecipient>;

const testInput = z.object({ ruleId: z.string().uuid(), limit: z.number().int().min(1).max(100) });

export const testNotificationRuleOperation = hasuraOperation(NOTIFICATIONS_BINDING, 'testNotificationRule', {
  kind: 'query',
  document: `query TestNotificationRule($rule: uuid!, $limit: Int!) {
  test_notification_rule(args: { p_rule: $rule, p_limit: $limit }) {
    event_id
    event_type
    severity
    occurred_at
    title
    would_match
    reason
    recipient_count
    recipients
  }
}`,
  variables: (input) => {
    const { ruleId, limit } = input as z.infer<typeof testInput>;
    return { rule: ruleId, limit };
  },
  mapResult: (data) => rootOf(data, 'test_notification_rule') ?? [],
});

/**
 * A dry run of a notification rule (`test_notification_rule`, a STABLE function: it writes and
 * sends nothing) against the organization's latest events, newest first: per event whether the
 * rule would match (else why not: another event type, conditions not met) and, for a match, the
 * recipients the fan-out would notify, on which channel. An inactive rule is tested as if it were
 * active. Refused with `notification_rule_not_found` for a rule that no longer exists.
 */
export const testNotificationRule = defineQuery('itap:test-notification-rule', {
  binding: testNotificationRuleOperation.binding,
  input: schema(testInput),
  output: schema(z.array(testRow)),
  reads: [
    resourceByName(NOTIFICATION_RULE_RESOURCE),
    resourceByName(NOTIFICATION_RULE_EVENT_TYPE_RESOURCE),
    resourceByName(NOTIFICATION_RULE_CHANNEL_RESOURCE),
    resourceByName(RECIPIENT_GROUP_RESOURCE),
    resourceByName(EVENT_RESOURCE),
  ],
});

const userNamesInput = z.object({ ids: z.array(z.string().uuid()) });

export const userNamesOperation = hasuraOperation(NOTIFICATIONS_BINDING, 'userNames', {
  kind: 'query',
  document: `query NotificationUserNames($ids: [uuid!]!) {
  users(where: { id: { _in: $ids } }) { id displayName }
}`,
  variables: (input) => input as z.infer<typeof userNamesInput>,
  mapResult: (data) => {
    const rows = z.array(z.object({ id: z.string(), displayName: z.string() })).safeParse(rootOf(data, 'users'));
    return Object.fromEntries((rows.success ? rows.data : []).map((row) => [row.id, row.displayName]));
  },
});

/** The names of the members a test would notify, by user id. */
export const notificationUserNames = defineQuery('itap:notification-user-names', {
  binding: userNamesOperation.binding,
  input: schema(userNamesInput),
  output: schema(z.record(z.string(), z.string())),
  reads: [resourceByName(USER_RESOURCE)],
});

/** The distinct members of the rows' recipients, for {@link notificationUserNames}. */
export function recipientUserIds(rows: readonly TestRow[]): string[] {
  return [...new Set(rows.flatMap((row) => row.recipients.flatMap((r) => (r.user_id === null ? [] : [r.user_id]))))];
}

/** What a test found: events read, matches, notifications (channel and recipient pairs) and distinct recipients. */
export function testSummary(rows: readonly TestRow[]): { events: number; matched: number; notifications: number; recipients: number } {
  const matched = rows.filter((row) => row.would_match);
  const recipients = new Set(matched.flatMap((row) => row.recipients.map((r) => r.user_id ?? `address:${r.address ?? ''}`)));
  return {
    events: rows.length,
    matched: matched.length,
    notifications: matched.reduce((sum, row) => sum + row.recipient_count, 0),
    recipients: recipients.size,
  };
}

/** Who a recipient is: the member's name, else the external address. */
export function recipientName(recipient: TestRecipient, names: Readonly<Record<string, string>>, t: (key: string, options?: { readonly params?: Record<string, unknown> }) => string): string {
  if (recipient.user_id !== null) return names[recipient.user_id] ?? t('member', { params: { id: recipient.user_id } });
  return recipient.address ?? '';
}

/** Whether a failed read is the function's own refusal for a rule that no longer exists. */
export function isRuleGone(error: unknown): boolean {
  const text = JSON.stringify(error ?? null);
  return text.includes('notification_rule_not_found');
}
