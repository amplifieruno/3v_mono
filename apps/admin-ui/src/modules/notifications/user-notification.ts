import { defineResource } from '@burojs/core';
import { NAV_ICONS, NAV_SECTIONS } from '../../app/nav';
import { USER_NOTIFICATION_RESOURCE } from '../../data/resource-names';
import { userNotificationFields } from './user-notification-fields';
import { acknowledgeNotificationFlow, markAllReadFlow, markReadFlow } from './user-notification-flows';

export { userNotificationFields };

/** Where the inbox lives; the bell links here. */
export const INBOX_PATH = '/inbox';

/** How often the inbox list and the bell read the inbox again. */
export const INBOX_POLL_MS = 30_000;

/**
 * The inbox (`itap.user_notifications`): the signed-in member's own in-app notifications, newest
 * first; nobody else's are ever listed (the database filters by the session user). Written by the
 * platform; the member marks them read, all at once or one by one, and acknowledges them. The
 * header bell counts the unread ones and lists the latest.
 */
export const userNotification = defineResource(USER_NOTIFICATION_RESOURCE, {
  texts: {
    label: 'Notification',
    labelPlural: 'Inbox',
    doc: {
      summary:
        'Your in-app notifications: what the notification rules, escalations, your subscriptions and reports told you. Mark them read, or acknowledge them to say you are on it. Only you see your inbox.',
    },
  },
  basePath: INBOX_PATH,
  section: NAV_SECTIONS.notifications,
  order: 5,
  icon: NAV_ICONS.inbox,
  displayField: 'title',
  data: { provider: 'hasura' },
  operations: { create: false, edit: false, delete: false },
  builtinActions: { edit: false, delete: false },
  fields: userNotificationFields,
  actions: (r) => ({
    resource: [r.action.flow('mark_all_read', markAllReadFlow)],
    item: [r.action.flow('mark_read', markReadFlow), r.action.flow('acknowledge', acknowledgeNotificationFlow)],
  }),
  views: {
    list: {
      columns: ['created_at', 'title', 'priority', 'read_at', 'acknowledged_at', 'incident_id'],
      optionalColumns: ['event_id'],
      defaultSort: [{ field: 'created_at', direction: 'desc' }],
      sortTiebreaker: 'id',
      refetchInterval: INBOX_POLL_MS,
      search: { fields: [{ field: 'title', op: 'contains' }] },
      filters: { pinned: ['priority'], fields: ['priority', 'read_at', 'acknowledged_at', 'incident_id', 'created_at'] },
      savedViews: [
        { id: 'unread', texts: 'Unread', state: { filters: [{ field: 'read_at', op: 'isNull' }] } },
        { id: 'unacknowledged', texts: 'Not acknowledged', state: { filters: [{ field: 'acknowledged_at', op: 'isNull' }] } },
      ],
    },
    show: {
      header: (l) => [l.grid(['priority', 'created_at', 'read_at', 'acknowledged_at'])],
      body: (l) => ['title', 'body', l.grid(['incident_id', 'event_id', 'delivery_id'])],
    },
  },
});
