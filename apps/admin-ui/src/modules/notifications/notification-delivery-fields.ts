import { f } from '@burojs/field-types';
import {
  ESCALATION_POLICY_RESOURCE,
  EVENT_RESOURCE,
  INCIDENT_RESOURCE,
  NOTIFICATION_DELIVERY_RESOURCE,
  NOTIFICATION_RULE_RESOURCE,
  NOTIFICATION_SUBSCRIPTION_RESOURCE,
  USER_RESOURCE,
} from '../../data/resource-names';
import { enumField } from '../../enums/field';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_CHANNEL_ENUM,
  NOTIFICATION_DELIVERY_ORIGINS,
  NOTIFICATION_DELIVERY_ORIGIN_ENUM,
  NOTIFICATION_DELIVERY_STATUSES,
  NOTIFICATION_DELIVERY_STATUS_ENUM,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_PRIORITY_ENUM,
} from '../../enums/notifications';
import { dateTime } from '../../fields/date-time';

const shown = ['list', 'show'] as const;
const showOnly = ['show'] as const;

/**
 * Columns of `itap.notification_deliveries` the `org_admin` role reads (every delivery of the
 * organization except other members' subscription deliveries), plus the console's computed
 * columns `to_me`, `origin`, `title` and `escalation_policy_id`. All written by the platform: the
 * fan-out, escalation, digests and reports create them, the senders move them on.
 */
export const notificationDeliveryFields = {
  id: f.uuid({ system: true, texts: 'ID', in: [] }),
  created_at: dateTime({
    system: true,
    in: [...shown],
    texts: { label: 'Created', doc: { summary: 'When the notification was created, at the event, the escalation step or the report.' } },
  }),
  title: f.string({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Title', doc: { summary: 'The notification’s title as its template rendered it.' } },
  }),
  status: enumField(NOTIFICATION_DELIVERY_STATUSES, NOTIFICATION_DELIVERY_STATUS_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Status',
      doc: {
        summary:
          'Pending until sent, then sent (handed to the provider) and delivered; a failure is retried up to five attempts, then given up as a dead letter. Digest items are combined into one digest delivery.',
      },
    },
  }),
  channel: enumField(NOTIFICATION_CHANNELS, NOTIFICATION_CHANNEL_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Channel',
      doc: {
        summary:
          'How it travels: in-app, email, SMS or push. Calls to other systems are not listed here: they are webhook deliveries, in a log of their own.',
      },
    },
  }),
  priority: enumField(NOTIFICATION_PRIORITIES, NOTIFICATION_PRIORITY_ENUM, {
    system: true,
    in: [...shown],
    texts: { label: 'Priority', doc: { summary: 'Critical deliveries ignore the recipient’s quiet hours; the others wait for them to end.' } },
  }),
  origin: enumField(NOTIFICATION_DELIVERY_ORIGINS, NOTIFICATION_DELIVERY_ORIGIN_ENUM, {
    system: true,
    in: [...shown],
    texts: {
      label: 'Origin',
      doc: { summary: 'What sent it: a notification rule, an escalation step, a personal subscription or a ready report.' },
    },
  }),
  recipient_user_id: f.relation({
    to: USER_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'none',
    texts: { label: 'Recipient', doc: { summary: 'The member told; empty when it went to an external address.' } },
  }),
  recipient_address: f.string({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Address', doc: { summary: 'The external email address or phone number told, for someone without an account.' } },
  }),
  rule_id: f.relation({
    to: NOTIFICATION_RULE_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'rule' },
    texts: { label: 'Rule', doc: { summary: 'The notification rule that matched, for a rule delivery.' } },
  }),
  escalation_policy_id: f.relation({
    to: ESCALATION_POLICY_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    texts: { label: 'Escalation policy', doc: { summary: 'The policy whose step paged, for an escalation delivery.' } },
  }),
  escalation_cycle: f.number({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Pass', doc: { summary: 'Which pass through the policy’s steps paged: 0 for the first, more when the policy repeats.' } },
  }),
  subscription_id: f.relation({
    to: NOTIFICATION_SUBSCRIPTION_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    providerOptions: { relationship: 'subscription' },
    texts: { label: 'Subscription', doc: { summary: 'Your subscription that matched, for a subscription delivery (only yours are listed).' } },
  }),
  report_id: f.uuid({
    system: true,
    nullable: true,
    in: [...showOnly],
    texts: { label: 'Report', doc: { summary: 'The report that is ready, for a report delivery.' } },
  }),
  event_id: f.relation({
    to: EVENT_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    texts: { label: 'Event', doc: { summary: 'The event it is about; empty for escalation pages and reports.' } },
  }),
  incident_id: f.relation({
    to: INCIDENT_RESOURCE,
    system: true,
    nullable: true,
    in: [...shown],
    open: 'page',
    providerOptions: { relationship: 'incident' },
    texts: { label: 'Incident', doc: { summary: 'The incident it is about, when there is one.' } },
  }),
  attempts: f.number({
    system: true,
    in: [...shown],
    texts: { label: 'Attempts', doc: { summary: 'How many times sending was tried; at the fifth failure it is given up.' } },
  }),
  error: f.text({
    system: true,
    nullable: true,
    in: [...shown],
    texts: { label: 'Error', doc: { summary: 'Why the last attempt failed or why it was given up (max_attempts, recipient_inactive).' } },
  }),
  deliver_after: dateTime({
    system: true,
    in: [...showOnly],
    texts: {
      label: 'Not before',
      doc: { summary: 'Held until then: the end of the recipient’s quiet hours, a digest’s end or the next retry. Empty for at once.' },
    },
  }),
  sent_at: dateTime({ system: true, in: [...showOnly], texts: { label: 'Sent', doc: { summary: 'When it was handed to the provider.' } } }),
  delivered_at: dateTime({
    system: true,
    in: [...showOnly],
    texts: { label: 'Delivered', doc: { summary: 'When it reached the recipient.' } },
  }),
  acknowledged_at: dateTime({
    system: true,
    in: [...showOnly],
    texts: {
      label: 'Acknowledged',
      doc: { summary: 'When the recipient acknowledged it in the inbox; acknowledging an escalation page also acknowledges its incident.' },
    },
  }),
  digested_into: f.relation({
    to: NOTIFICATION_DELIVERY_RESOURCE,
    system: true,
    nullable: true,
    in: [...showOnly],
    open: 'page',
    providerOptions: { relationship: 'digest' },
    texts: { label: 'Digest', doc: { summary: 'The digest delivery this item was combined into.' } },
  }),
  content: f.json({
    system: true,
    in: [...showOnly],
    texts: { label: 'Content', doc: { summary: 'What was sent: subject, title and body as rendered, with the template and any digest items.' } },
  }),
  to_me: f.boolean({
    system: true,
    in: [],
    texts: { label: 'To me', doc: { summary: 'Whether you are the recipient (the "Mine" view).' } },
  }),
};
