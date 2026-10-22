import { type FlowConfig, type FlowUnknownCheck, cond, ref } from '@burojs/core';
import { NAV_ICONS } from '../../app/nav';
import { resourceByName } from '../../data/resource-by-name';
import { USER_NOTIFICATION_RESOURCE } from '../../data/resource-names';
import { acknowledgeNotification, markAllNotificationsRead, markNotificationRead } from './inbox-ops';

const UNREAD = cond.not(cond.present(ref('record', 'read_at')));
const UNACKNOWLEDGED = cond.not(cond.present(ref('record', 'acknowledged_at')));
const input = { notificationId: ref('record', 'id') };

/** Check again after a lost answer: reads the notification back; applied when `column` is stamped. */
function stamped(column: 'read_at' | 'acknowledged_at'): FlowUnknownCheck {
  return async ({ record, data }) => {
    const id = record?.id;
    if (typeof id !== 'string' || id === '') return 'unknown';
    try {
      const { data: row } = await data.one(resourceByName(USER_NOTIFICATION_RESOURCE) as never, { id } as never);
      if (row === null || row === undefined) return 'unknown';
      const value = (row as Readonly<Record<string, unknown>>)[column];
      return typeof value === 'string' && value !== '' ? 'applied' : 'not-applied';
    } catch {
      return 'unknown';
    }
  };
}

/**
 * Check again after "Mark all read" lost its answer: applied when nothing in the inbox is unread
 * now. A notification that arrived since reads as not applied, and running it again is harmless.
 */
export const allRead: FlowUnknownCheck = async ({ data }) => {
  try {
    const unread = await data.list(resourceByName(USER_NOTIFICATION_RESOURCE) as never, {
      filter: { field: 'read_at', op: 'isNull' },
      pagination: { kind: 'offset', page: 1, pageSize: 1 },
    } as never);
    return (unread.data as readonly unknown[]).length === 0 ? 'applied' : 'not-applied';
  } catch {
    return 'unknown';
  }
};

/** "Mark read" on an unread notification of the inbox (`mark_notifications_read` with its id). */
export const markReadFlow = {
  texts: {
    label: 'Mark read',
    notify: 'Marked read.',
    doc: { summary: 'Marks the notification read: it no longer counts on the bell. It stays in the inbox.' },
  },
  icon: NAV_ICONS.markRead,
  surfaces: { default: 'menu', show: 'auto', row: 'auto' },
  when: UNREAD,
  submit: {
    mutation: markNotificationRead,
    // Idempotent: a read notification keeps its first read time.
    retry: 'after-auth-refresh',
    input,
    onUnknown: { check: stamped('read_at') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/**
 * "Acknowledge" on a notification not acknowledged yet (`acknowledge_notification`): you have seen
 * it and are on it; it is read as well. On an escalation page the server also acknowledges its
 * incident while that is still open and unacknowledged, which stops the escalation; the incident
 * and its timeline are read again (plan 06 Review Focus 3).
 */
export const acknowledgeNotificationFlow = {
  texts: {
    label: 'Acknowledge',
    notify: 'Acknowledged.',
    doc: {
      summary:
        'Confirms you have seen the notification and are handling it. Acknowledging an escalation page also acknowledges its incident if nobody has yet, which stops the escalation.',
    },
  },
  icon: NAV_ICONS.acknowledge,
  surfaces: { default: 'menu', show: 'auto', row: 'menu' },
  when: UNACKNOWLEDGED,
  submit: {
    mutation: acknowledgeNotification,
    // Idempotent: a repeat answers the acknowledged notification unchanged.
    retry: 'after-auth-refresh',
    input,
    onUnknown: { check: stamped('acknowledged_at') },
  },
  then: { notify: true },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;

/**
 * "Mark all read" on the inbox list: every unread notification of the signed-in member is read
 * (`mark_notifications_read` without ids); other members' inboxes are never touched (the function
 * reads the session user, plan 06 Review Focus 5).
 */
export const markAllReadFlow = {
  texts: {
    label: 'Mark all read',
    confirm: 'Mark every unread notification in your inbox as read?',
    notify: 'Marked read: {{marked}}.',
    doc: { summary: 'Marks every unread notification in your inbox as read; other members’ inboxes are not affected.' },
  },
  icon: NAV_ICONS.markAllRead,
  surfaces: { list: 'regular' },
  confirm: true,
  submit: {
    mutation: markAllNotificationsRead,
    // Idempotent: a repeat marks what arrived since, nothing else changes.
    retry: 'after-auth-refresh',
    input: {},
    onUnknown: { check: allRead },
  },
  then: { notify: { params: { marked: ref('result', 'marked') } } },
} satisfies FlowConfig<unknown, Record<never, never>, Record<never, never>>;
