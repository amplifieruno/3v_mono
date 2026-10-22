import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Notification enums; values are the rows of the Hasura enum tables in `NOTIFICATION_ENUM_TABLES`. */

export const NOTIFICATION_CHANNEL_ENUM = 'notification_channel';
export const NOTIFICATION_PRIORITY_ENUM = 'notification_priority';
export const NOTIFICATION_DIGEST_MODE_ENUM = 'notification_digest_mode';

/** Every channel a notification can travel on (`itap.notification_channels`). */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push', 'webhook'] as const;

/**
 * The channels a person is reached on: every channel but `webhook`. Rules, escalation steps and
 * subscriptions refuse a webhook (CHECK `*_channel_not_webhook`); webhooks have their own
 * subscriptions. Templates are rendered for these channels only (a webhook sends the event as JSON).
 */
export const PERSON_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;

/** Priorities from the lowest to the highest (`itap.priority_rank`). */
export const NOTIFICATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const NOTIFICATION_DIGEST_MODES = ['none', 'hourly', 'daily'] as const;

export const notificationChannelEnum = defineEnum({
  name: NOTIFICATION_CHANNEL_ENUM,
  values: enumValues(NOTIFICATION_CHANNELS, {
    in_app: 'info',
    email: 'secondary',
    sms: 'secondary',
    push: 'secondary',
    webhook: 'outline',
  }),
  texts: {
    in_app: { label: 'In-app', doc: { summary: 'The console’s inbox (the bell in the header).' } },
    email: { label: 'Email', doc: { summary: 'An email to the member’s address or an external address.' } },
    sms: { label: 'SMS', doc: { summary: 'A text message to a phone number (international format, +…).' } },
    push: { label: 'Push', doc: { summary: 'A push notification to the member’s devices.' } },
    webhook: {
      label: 'Webhook',
      doc: { summary: 'An HTTP call to another system; set up as a webhook subscription, not on rules.' },
    },
  },
});

export const notificationPriorityEnum = defineEnum({
  name: NOTIFICATION_PRIORITY_ENUM,
  values: enumValues(NOTIFICATION_PRIORITIES, {
    low: 'outline',
    medium: 'info',
    high: 'warning',
    critical: 'destructive',
  }),
  texts: {
    low: { label: 'Low', doc: { summary: 'Informational; waits for quiet hours to end.' } },
    medium: { label: 'Medium', doc: { summary: 'The usual priority; waits for quiet hours to end.' } },
    high: { label: 'High', doc: { summary: 'Urgent; still waits for quiet hours to end.' } },
    critical: { label: 'Critical', doc: { summary: 'Delivered at once, even during a recipient’s quiet hours.' } },
  },
});

export const notificationDigestModeEnum = defineEnum({
  name: NOTIFICATION_DIGEST_MODE_ENUM,
  values: enumValues(NOTIFICATION_DIGEST_MODES, { none: 'outline', hourly: 'secondary', daily: 'secondary' }),
  texts: {
    none: { label: 'Immediately', doc: { summary: 'Each match is sent on its own, as it happens.' } },
    hourly: { label: 'Hourly digest', doc: { summary: 'Matches are gathered and sent as one digest every hour.' } },
    daily: { label: 'Daily digest', doc: { summary: 'Matches are gathered and sent as one digest once a day.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const NOTIFICATION_ENUM_TABLES: Readonly<Record<string, string>> = {
  [NOTIFICATION_CHANNEL_ENUM]: 'notification_channels',
  [NOTIFICATION_PRIORITY_ENUM]: 'notification_priorities',
  [NOTIFICATION_DIGEST_MODE_ENUM]: 'notification_digest_modes',
};
