import { defineMutation, defineQuery } from '@burojs/core';
import { z } from 'zod';
import { hasuraOperation, rootOf } from '../../data/operations';
import { resourceByName } from '../../data/resource-by-name';
import {
  INCIDENT_ACTIVITY_RESOURCE,
  INCIDENT_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  USER_NOTIFICATION_RESOURCE,
} from '../../data/resource-names';
import { schema } from '../../data/schema';
import { MEMBER_NOT_ACTIVE_REFUSAL, type SqlRefusalText, sqlRefusals } from '../../data/sql-refusals';

/** The registry key the inbox operations are bound under. */
export const INBOX_BINDING = 'inbox';

/** How many of the latest notifications the bell lists. */
export const BELL_LATEST = 5;

const NOTHING = ' Nothing was changed.';

/**
 * What `acknowledge_notification` raises: the notification is not the caller's (or is gone), or,
 * for an escalation page, `acknowledge_incident` refused the incident it acknowledges on the way.
 */
export const ACKNOWLEDGE_NOTIFICATION_REFUSALS = {
  notification_not_found: 'The notification is no longer in your inbox.' + NOTHING,
  incident_not_found: 'The incident of this page no longer exists in this organization.' + NOTHING,
  incident_invalid_transition: 'Someone else moved the incident on in the meantime: reload the page to see where it stands.' + NOTHING,
  member_not_active: MEMBER_NOT_ACTIVE_REFUSAL,
} satisfies Record<string, SqlRefusalText>;

export const notificationIdInput = z.object({ notificationId: z.string().uuid() });
export const markedRead = z.object({ marked: z.number() });
export const acknowledgedNotification = z.object({ id: z.string(), acknowledged_at: z.string().nullable() });

const ROW_FIELDS = 'id read_at acknowledged_at';

/** `mark_notifications_read(hasura_session, p_ids)` with one id: that notification of the caller is read. */
export const markNotificationReadOperation = hasuraOperation(
  INBOX_BINDING,
  'markNotificationRead',
  {
    kind: 'mutation',
    document: `mutation MarkNotificationRead($ids: _uuid!) {
  mark_notifications_read(args: { p_ids: $ids }) { ${ROW_FIELDS} }
}`,
    variables: (input) => ({ ids: `{${(input as z.infer<typeof notificationIdInput>).notificationId}}` }),
    mapResult: (data) => {
      const rows = rootOf(data, 'mark_notifications_read');
      return { marked: Array.isArray(rows) ? rows.length : 0 };
    },
  },
  sqlRefusals({}),
);

/**
 * `mark_notifications_read(hasura_session, NULL)`: every unread notification of the caller (the
 * session organization and user, never another member's) is read; answers how many changed.
 */
export const markAllNotificationsReadOperation = hasuraOperation(
  INBOX_BINDING,
  'markAllNotificationsRead',
  {
    kind: 'mutation',
    document: `mutation MarkAllNotificationsRead {
  mark_notifications_read(args: { p_ids: null }) { id }
}`,
    variables: () => ({}),
    mapResult: (data) => {
      const rows = rootOf(data, 'mark_notifications_read');
      return { marked: Array.isArray(rows) ? rows.length : 0 };
    },
  },
  sqlRefusals({}),
);

/**
 * `acknowledge_notification(hasura_session, p_notification)`: the caller acknowledges their
 * notification (and so reads it); an escalation page also acknowledges its open, unacknowledged
 * incident. A repeat answers the notification unchanged.
 */
export const acknowledgeNotificationOperation = hasuraOperation(
  INBOX_BINDING,
  'acknowledgeNotification',
  {
    kind: 'mutation',
    document: `mutation AcknowledgeNotification($notification: uuid!) {
  acknowledge_notification(args: { p_notification: $notification }) { ${ROW_FIELDS} }
}`,
    variables: (input) => ({ notification: (input as z.infer<typeof notificationIdInput>).notificationId }),
    mapResult: (data) => {
      const rows = rootOf(data, 'acknowledge_notification');
      return Array.isArray(rows) ? (rows[0] ?? null) : null;
    },
  },
  sqlRefusals(ACKNOWLEDGE_NOTIFICATION_REFUSALS),
);

/** One notification as the bell lists it. */
export const bellNotification = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.string(),
  created_at: z.string(),
  read_at: z.string().nullable(),
});
export type BellNotification = z.infer<typeof bellNotification>;

/** What the bell shows: the unread count and the latest notifications. */
export const inboxSummaryOutput = z.object({ unread: z.number(), latest: z.array(bellNotification) });
export type InboxSummary = z.infer<typeof inboxSummaryOutput>;

/** The answer of the summary query as the bell reads it; a malformed answer reads as an empty inbox. */
export function summaryOf(data: unknown): InboxSummary {
  const count = (rootOf(data, 'unread') as { aggregate?: { count?: unknown } } | undefined)?.aggregate?.count;
  const latest = z.array(bellNotification).safeParse(rootOf(data, 'latest'));
  return { unread: typeof count === 'number' ? count : 0, latest: latest.success ? latest.data : [] };
}

export const inboxSummaryOperation = hasuraOperation(INBOX_BINDING, 'inboxSummary', {
  kind: 'query',
  document: `query InboxSummary {
  unread: user_notifications_aggregate(where: { read_at: { _is_null: true } }) { aggregate { count } }
  latest: user_notifications(order_by: { created_at: desc }, limit: ${BELL_LATEST}) { id title priority created_at read_at }
}`,
  variables: () => ({}),
  mapResult: summaryOf,
});

/** The bell's figures (`itap:inbox-summary`): own notifications only (the database filters by user). */
export const inboxSummary = defineQuery('itap:inbox-summary', {
  binding: inboxSummaryOperation.binding,
  input: schema(z.object({})),
  output: schema(inboxSummaryOutput),
  reads: [resourceByName(USER_NOTIFICATION_RESOURCE)],
});

/** Marking read changes the inbox (its list, page and the bell). */
export const markNotificationRead = defineMutation('itap:mark-notification-read', {
  binding: markNotificationReadOperation.binding,
  input: schema(notificationIdInput),
  output: schema(markedRead),
  effects: [{ resource: USER_NOTIFICATION_RESOURCE }],
});

export const markAllNotificationsRead = defineMutation('itap:mark-all-notifications-read', {
  binding: markAllNotificationsReadOperation.binding,
  input: schema(z.object({})),
  output: schema(markedRead),
  effects: [{ resource: USER_NOTIFICATION_RESOURCE }],
});

/**
 * What acknowledging changes: the inbox, the delivery (its acknowledgement is copied there) and,
 * for an escalation page, the incident and its timeline; all are read again (plan 06 Review Focus 3).
 */
export const ACKNOWLEDGE_NOTIFICATION_EFFECTS = [
  { resource: USER_NOTIFICATION_RESOURCE },
  { resource: NOTIFICATION_DELIVERY_RESOURCE },
  { resource: INCIDENT_RESOURCE },
  { resource: INCIDENT_ACTIVITY_RESOURCE },
];

export const acknowledgeNotification = defineMutation('itap:acknowledge-notification', {
  binding: acknowledgeNotificationOperation.binding,
  input: schema(notificationIdInput),
  output: schema(acknowledgedNotification.nullable()),
  effects: ACKNOWLEDGE_NOTIFICATION_EFFECTS,
});

/** The inbox operations, for the module's registry. */
export const INBOX_OPERATIONS = [
  markNotificationReadOperation,
  markAllNotificationsReadOperation,
  acknowledgeNotificationOperation,
  inboxSummaryOperation,
];
