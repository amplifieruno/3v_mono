import { defineEnum } from '@burojs/core';
import { enumValues } from './values';

/* Notification enums; values are the rows of the Hasura enum tables in `NOTIFICATION_ENUM_TABLES`. */

export const NOTIFICATION_CHANNEL_ENUM = 'notification_channel';
export const NOTIFICATION_PRIORITY_ENUM = 'notification_priority';
export const NOTIFICATION_DIGEST_MODE_ENUM = 'notification_digest_mode';
/** The channels a person can be reached on, as an enum of its own (G52: a picker lists its enum's every value). */
export const PERSON_CHANNEL_ENUM = 'notification_person_channel';
/** The channels an external address can be reached on, as an enum of its own (G52). */
export const ADDRESS_CHANNEL_ENUM = 'notification_address_channel';
export const NOTIFICATION_DELIVERY_STATUS_ENUM = 'notification_delivery_status';
export const NOTIFICATION_DELIVERY_ORIGIN_ENUM = 'notification_delivery_origin';

/** Every channel a notification can travel on (`itap.notification_channels`). */
export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'push', 'webhook'] as const;

/**
 * The channels a person is reached on: every channel but `webhook`. Rules, escalation steps and
 * subscriptions refuse a webhook (CHECK `*_channel_not_webhook`); webhooks have their own
 * subscriptions. Templates are rendered for these channels only (a webhook sends the event as JSON).
 */
export const PERSON_CHANNELS = ['in_app', 'email', 'sms', 'push'] as const;

/** The channels an external address is reached on: its kind (`recipient_group_members_address_format`). */
export const ADDRESS_CHANNELS = ['email', 'sms'] as const;

/** Priorities from the lowest to the highest (`itap.priority_rank`). */
export const NOTIFICATION_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;

export const NOTIFICATION_DIGEST_MODES = ['none', 'hourly', 'daily'] as const;

const CHANNEL_COLORS = {
  in_app: 'info',
  email: 'secondary',
  sms: 'secondary',
  push: 'secondary',
  webhook: 'outline',
} as const;

const CHANNEL_TEXTS = {
  in_app: { label: 'In-app', doc: { summary: 'The console’s inbox (the bell in the header).' } },
  email: { label: 'Email', doc: { summary: 'An email to the member’s address or an external address.' } },
  sms: { label: 'SMS', doc: { summary: 'A text message to a phone number (international format, +…).' } },
  push: { label: 'Push', doc: { summary: 'A push notification to the member’s devices.' } },
  webhook: {
    label: 'Webhook',
    doc: { summary: 'An HTTP call to another system; set up as a webhook subscription, not on rules.' },
  },
};

/** The texts of `values` among the channels'. */
function channelTexts<const V extends readonly (keyof typeof CHANNEL_TEXTS)[]>(values: V) {
  return Object.fromEntries(values.map((value) => [value, CHANNEL_TEXTS[value]])) as Pick<typeof CHANNEL_TEXTS, V[number]>;
}

export const notificationChannelEnum = defineEnum({
  name: NOTIFICATION_CHANNEL_ENUM,
  values: enumValues(NOTIFICATION_CHANNELS, CHANNEL_COLORS),
  texts: CHANNEL_TEXTS,
});

/*
 * buro's enum picker lists every value of the field's registered enum, whatever subset the field
 * declares (G52), so the channel subsets are enums of their own over the same values and texts:
 * a form for a person never offers a webhook, one for an external address only email and SMS.
 */
export const personChannelEnum = defineEnum({
  name: PERSON_CHANNEL_ENUM,
  values: enumValues(PERSON_CHANNELS, CHANNEL_COLORS),
  texts: channelTexts(PERSON_CHANNELS),
});

export const addressChannelEnum = defineEnum({
  name: ADDRESS_CHANNEL_ENUM,
  values: enumValues(ADDRESS_CHANNELS, CHANNEL_COLORS),
  texts: channelTexts(ADDRESS_CHANNELS),
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

/** Where a delivery is in its life (`itap.notification_delivery_statuses`, plus `digested` from the digests). */
export const NOTIFICATION_DELIVERY_STATUSES = ['pending', 'sent', 'delivered', 'failed', 'retrying', 'dead_letter', 'digested'] as const;

/** What sent a delivery: exactly one of its origin columns (`notification_deliveries_exactly_one_origin`). */
export const NOTIFICATION_DELIVERY_ORIGINS = ['rule', 'escalation', 'subscription', 'report'] as const;

export const notificationDeliveryStatusEnum = defineEnum({
  name: NOTIFICATION_DELIVERY_STATUS_ENUM,
  values: enumValues(NOTIFICATION_DELIVERY_STATUSES, {
    pending: 'secondary',
    sent: 'info',
    delivered: 'success',
    failed: 'warning',
    retrying: 'warning',
    dead_letter: 'destructive',
    digested: 'outline',
  }),
  texts: {
    pending: { label: 'Pending', doc: { summary: 'Waiting to be sent, possibly held until quiet hours or a digest end.' } },
    sent: { label: 'Sent', doc: { summary: 'Handed to the channel’s provider (an email or SMS gateway).' } },
    delivered: { label: 'Delivered', doc: { summary: 'Reached the recipient: in their inbox or confirmed by the provider.' } },
    failed: { label: 'Failed', doc: { summary: 'The last attempt failed; it is tried again.' } },
    retrying: { label: 'Retrying', doc: { summary: 'Waiting for its next attempt after a failure.' } },
    dead_letter: { label: 'Dead letter', doc: { summary: 'Given up: five attempts failed, or the recipient is no longer an active member.' } },
    digested: { label: 'In a digest', doc: { summary: 'Not sent on its own: combined into a digest delivery sent later.' } },
  },
});

export const notificationDeliveryOriginEnum = defineEnum({
  name: NOTIFICATION_DELIVERY_ORIGIN_ENUM,
  values: enumValues(NOTIFICATION_DELIVERY_ORIGINS, {
    rule: 'info',
    escalation: 'warning',
    subscription: 'secondary',
    report: 'outline',
  }),
  texts: {
    rule: { label: 'Notification rule', doc: { summary: 'A notification rule matched an event.' } },
    escalation: { label: 'Escalation', doc: { summary: 'An escalation step paged someone about an unacknowledged incident.' } },
    subscription: { label: 'Subscription', doc: { summary: 'A personal subscription matched an event.' } },
    report: { label: 'Report', doc: { summary: 'A scheduled report is ready.' } },
  },
});

/** Each enum above by the Hasura enum table holding its values. */
export const NOTIFICATION_ENUM_TABLES: Readonly<Record<string, string>> = {
  [NOTIFICATION_CHANNEL_ENUM]: 'notification_channels',
  [NOTIFICATION_PRIORITY_ENUM]: 'notification_priorities',
  [NOTIFICATION_DIGEST_MODE_ENUM]: 'notification_digest_modes',
  [NOTIFICATION_DELIVERY_STATUS_ENUM]: 'notification_delivery_statuses',
};
